import * as vscode from 'vscode';
import { buildNodeTree, collectSymbolItemsFromSource } from './nodeList';
import * as Globals from './myGlobals';
import { BoundedCache } from './mapCache';
import type { NodeTreeItem, SymbolNode } from './types';

type SymbolSource = 'vscode' | 'tsc';

type EditorSymbolCache = {
  documentVersion: number;
  source: SymbolSource;
  symbols: SymbolNode[];
};

type SelectionCycleState = {
  uri: string;
  documentVersion: number;
  chainKey: string;
  chain: SymbolNode[];
  currentIndex: number;
  selection: vscode.Selection;
};

const cache = new BoundedCache<vscode.Uri, EditorSymbolCache>( 3 );
let cycleState: SelectionCycleState | undefined;

function selectionEquals( a: vscode.Selection, b: vscode.Selection ): boolean {
  return a.anchor.isEqual( b.anchor ) && a.active.isEqual( b.active );
}

function makeChainKey( chain: SymbolNode[] ): string {
  return chain
    .map( s => `${s.name}|${s.range.start.line}:${s.range.start.character}-${s.range.end.line}:${s.range.end.character}` )
    .join( '>' );
}

function nameToKind( name: string ): vscode.SymbolKind {
  switch ( name ) {
    case 'file': return vscode.SymbolKind.File;
    case 'module': return vscode.SymbolKind.Module;
    case 'namespace': return vscode.SymbolKind.Namespace;
    case 'package': return vscode.SymbolKind.Package;
    case 'class': return vscode.SymbolKind.Class;
    case 'method': return vscode.SymbolKind.Method;
    case 'property': return vscode.SymbolKind.Property;
    case 'field': return vscode.SymbolKind.Field;
    case 'constructor': return vscode.SymbolKind.Constructor;
    case 'enum': return vscode.SymbolKind.Enum;
    case 'interface': return vscode.SymbolKind.Interface;
    case 'function': return vscode.SymbolKind.Function;
    case 'variable': return vscode.SymbolKind.Variable;
    case 'constant': return vscode.SymbolKind.Constant;
    case 'string': return vscode.SymbolKind.String;
    case 'number': return vscode.SymbolKind.Number;
    case 'boolean': return vscode.SymbolKind.Boolean;
    case 'array': return vscode.SymbolKind.Array;
    case 'object': return vscode.SymbolKind.Object;
    case 'key': return vscode.SymbolKind.Key;
    case 'null': return vscode.SymbolKind.Null;
    case 'enumMember': return vscode.SymbolKind.EnumMember;
    case 'struct': return vscode.SymbolKind.Struct;
    case 'event': return vscode.SymbolKind.Event;
    case 'operator': return vscode.SymbolKind.Operator;
    case 'typeParameter': return vscode.SymbolKind.TypeParameter;
    default: return vscode.SymbolKind.Object;
  }
}

function kindToName( kind: vscode.SymbolKind ): string {
  switch ( kind ) {
    case vscode.SymbolKind.File: return 'file';
    case vscode.SymbolKind.Module: return 'module';
    case vscode.SymbolKind.Namespace: return 'namespace';
    case vscode.SymbolKind.Package: return 'package';
    case vscode.SymbolKind.Class: return 'class';
    case vscode.SymbolKind.Method: return 'method';
    case vscode.SymbolKind.Property: return 'property';
    case vscode.SymbolKind.Field: return 'field';
    case vscode.SymbolKind.Constructor: return 'constructor';
    case vscode.SymbolKind.Enum: return 'enum';
    case vscode.SymbolKind.Interface: return 'interface';
    case vscode.SymbolKind.Function: return 'function';
    case vscode.SymbolKind.Variable: return 'variable';
    case vscode.SymbolKind.Constant: return 'constant';
    case vscode.SymbolKind.String: return 'string';
    case vscode.SymbolKind.Number: return 'number';
    case vscode.SymbolKind.Boolean: return 'boolean';
    case vscode.SymbolKind.Array: return 'array';
    case vscode.SymbolKind.Object: return 'object';
    case vscode.SymbolKind.Key: return 'key';
    case vscode.SymbolKind.Null: return 'null';
    case vscode.SymbolKind.EnumMember: return 'enumMember';
    case vscode.SymbolKind.Struct: return 'struct';
    case vscode.SymbolKind.Event: return 'event';
    case vscode.SymbolKind.Operator: return 'operator';
    case vscode.SymbolKind.TypeParameter: return 'typeParameter';
    default: return 'object';
  }
}

function attachParents( roots: SymbolNode[] ): void {
  function walk( node: SymbolNode, parent?: SymbolNode ) {
    node.parent = parent;
    if ( node.children?.length ) {
      for ( const child of node.children ) {
        walk( child, node );
      }
    }
  }

  for ( const root of roots ) {
    walk( root, undefined );
  }
}

function toSymbolNodesFromDocumentSymbols( symbols: vscode.DocumentSymbol[], uri: vscode.Uri ): SymbolNode[] {
  return symbols.map( s => ( {
    name: ( vscode.window.activeTextEditor && s.kind === vscode.SymbolKind.String )
      ? vscode.window.activeTextEditor.document.getText( s.range )
      : s.name,
    detail: kindToName( s.kind ),
    kind: s.kind,
    range: s.range,
    selectionRange: s.selectionRange,
    uri,
    children: toSymbolNodesFromDocumentSymbols( s.children, uri )
      .sort( ( a, b ) => a.range.start.isBefore( b.range.start ) ? -1 : 1 ),
    parent: undefined
  } ) );
}

function toSymbolNodesFromNodeTreeItems( items: NodeTreeItem[], uri: vscode.Uri ): SymbolNode[] {
  return items.map( item => ( {
    name: item.node.label,
    detail: item.node.detail,
    kind: nameToKind( item.node.kind ),
    range: item.node.range,
    selectionRange: item.node.selectionRange,
    uri,
    children: toSymbolNodesFromNodeTreeItems( item.children, uri ),
    parent: undefined
  } ) );
}

async function getDocumentSymbolsWithRetry(
  uri: vscode.Uri,
  attempts = [1, 2, 3, 4, 5],
  delayMs = 200
): Promise<vscode.DocumentSymbol[] | undefined> {

  for await ( const attempt of attempts ) {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );

    if ( symbols?.length ) {
      return symbols;
    }

    await new Promise( resolve => setTimeout( resolve, delayMs * ( 1 + attempt * 0.5 ) ) );
  }

  return undefined;
}

async function buildSymbolsForDocument( document: vscode.TextDocument, source: SymbolSource ): Promise<SymbolNode[]> {
  let symbols: SymbolNode[] = [];

  if ( source === 'tsc' ) {
    const nodes = await collectSymbolItemsFromSource( document );
    if ( nodes.length ) {
      const tree = await buildNodeTree( nodes );
      symbols = toSymbolNodesFromNodeTreeItems( tree, document.uri );
    }
  }
  else {
    const docSymbols = await getDocumentSymbolsWithRetry( document.uri );
    if ( docSymbols?.length ) {
      symbols = toSymbolNodesFromDocumentSymbols( docSymbols, document.uri );
    }
  }

  attachParents( symbols );
  return symbols;
}

async function getCachedSymbolsForEditor( editor: vscode.TextEditor ): Promise<SymbolNode[]> {
  const _Globals = Globals.default;
  _Globals.updateIsJSTS( editor );

  const source: SymbolSource = ( _Globals.isJSTS && _Globals.useTypescriptCompiler ) ? 'tsc' : 'vscode';
  const uri = editor.document.uri;

  const hit = cache.get( uri );
  if ( hit && hit.documentVersion === editor.document.version && hit.source === source ) {
    return hit.symbols;
  }

  const symbols = await buildSymbolsForDocument( editor.document, source );
  cache.set( uri, {
    documentVersion: editor.document.version,
    source,
    symbols
  } );

  return symbols;
}

function getSymbolChainAtPosition( symbols: SymbolNode[], position: vscode.Position ): SymbolNode[] | undefined {
  const chain: SymbolNode[] = [];

  function walk( list: SymbolNode[] ): boolean {
    for ( const symbol of list ) {
      if ( symbol.range.contains( position ) ) {
        chain.push( symbol );
        return walk( symbol.children ) || true;
      }
    }

    return false;
  }

  walk( symbols );
  return chain.length ? chain : undefined;
}

function getChainFromLeaf( leaf: SymbolNode ): SymbolNode[] {
  const chain: SymbolNode[] = [];
  let current: SymbolNode | undefined = leaf;

  while ( current ) {
    chain.push( current );
    current = current.parent;
  }

  return chain.reverse();
}

function getNextSymbolTargetFromChain(
  editor: vscode.TextEditor,
  chain: SymbolNode[]
): { symbol: SymbolNode; selection: vscode.Selection; } | undefined {
  const uri = editor.document.uri.toString();
  const chainKey = makeChainKey( chain );

  if ( cycleState
    && cycleState.uri === uri
    && cycleState.documentVersion === editor.document.version
    && selectionEquals( editor.selection, cycleState.selection ) ) {

    cycleState.currentIndex = Math.max( 0, cycleState.currentIndex - 1 );
    const symbol = cycleState.chain[cycleState.currentIndex];
    const selection = makeSelectionFromSymbol( editor, symbol );
    cycleState.selection = selection;

    return { symbol, selection };
  }

  if ( !chain.length ) {
    cycleState = undefined;
    return undefined;
  }

  const currentIndex = chain.length - 1;
  const symbol = chain[currentIndex];
  const selection = makeSelectionFromSymbol( editor, symbol );

  cycleState = {
    uri,
    documentVersion: editor.document.version,
    chainKey,
    chain,
    currentIndex,
    selection
  };

  return { symbol, selection };
}

export function makeSelectionFromSymbol( editor: vscode.TextEditor, symbol: SymbolNode ): vscode.Selection {
  if ( symbol.name.startsWith( 'return' ) ) {
    return new vscode.Selection( symbol.selectionRange.start, symbol.selectionRange.end );
  }

  const lastLineLength = editor.document.lineAt( symbol.range.end ).text.length;
  const extendedRange = symbol.range.with( {
    start: new vscode.Position( symbol.range.start.line, 0 ),
    end: new vscode.Position( symbol.range.end.line, lastLineLength )
  } );

  return new vscode.Selection( extendedRange.start, extendedRange.end );
}

export function resetSelectionCycle(): void {
  cycleState = undefined;
}

export function getNextSymbolTargetFromSymbol(
  editor: vscode.TextEditor,
  symbol: SymbolNode
): { symbol: SymbolNode; selection: vscode.Selection; } | undefined {
  const chain = getChainFromLeaf( symbol );
  if ( !chain.length ) {
    cycleState = undefined;
    return undefined;
  }

  const symbolSelection = makeSelectionFromSymbol( editor, symbol );

  // Explicit selection-icon clicks on a different tree item should start a new cycle from that item.
  if ( !selectionEquals( editor.selection, symbolSelection ) ) {
    const currentIndex = chain.length - 1;
    cycleState = {
      uri: editor.document.uri.toString(),
      documentVersion: editor.document.version,
      chainKey: makeChainKey( chain ),
      chain,
      currentIndex,
      selection: symbolSelection
    };

    return {
      symbol: chain[currentIndex],
      selection: symbolSelection
    };
  }

  return getNextSymbolTargetFromChain( editor, chain );
}

export async function getNextSymbolTarget( editor: vscode.TextEditor ): Promise<{ symbol: SymbolNode; selection: vscode.Selection; } | undefined> {

  const symbols = await getCachedSymbolsForEditor( editor );
  if ( !symbols.length ) {
    cycleState = undefined;
    return undefined;
  }

  const chain = getSymbolChainAtPosition( symbols, editor.selection.active );
  return getNextSymbolTargetFromChain( editor, chain || [] );
}


