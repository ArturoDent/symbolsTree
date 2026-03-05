import * as vscode from 'vscode';
import { collectSymbolItemsFromSource, buildNodeTree, filterTree } from './nodeList';
import type { NodeTreeItem, SymbolNode } from './types';
import { TreeCache, type CacheUse } from './types';
import { showTreeViewMessage, showQuickPickMessage } from './messages';
import { BoundedCache } from './mapCache';
import { debounce } from "ts-debounce";
import * as Globals from './myGlobals';


let filteredTreeSymbols: SymbolNode[] = [];

// Define a type for the BoundedCache value, key is a Uri
// add program and sourceFile ?
type TreeCache = {
  refreshSymbols: boolean;
  filterQuery: string | string[];
  allSymbols: SymbolNode[];
  filteredSymbols: SymbolNode[];
};


export class SymbolsProvider implements vscode.TreeDataProvider<SymbolNode> {

  private _onDidChangeTreeData: vscode.EventEmitter<SymbolNode | undefined | null | void> = new vscode.EventEmitter<SymbolNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SymbolNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private disposables: vscode.Disposable[] = [];
  private view?: vscode.TreeView<SymbolNode>;

  // Create a bounded cache of Map <Uri → TreeCache> with max size 3
  private cache = new BoundedCache<vscode.Uri, TreeCache>( 3 );
  public debouncedRefresh: ReturnType<typeof debounce>;

  public static lockedUri: vscode.Uri | undefined = undefined;
  public static locked = false;
  public static filtered = false;

  private tree: SymbolNode[] = [];
  private filterQuery: string[] | string = '';  // could enable creating a filtered TreeView from a setting

  constructor( context: vscode.ExtensionContext ) {

    context.subscriptions.push( this.cache );

    // create a debounced async function
    // 800ms seems to be necessary to avaoid a rapid switching between editors problem
    this.debouncedRefresh = debounce( ( q, k ) => this.refresh( q, k ), 800, { isImmediate: false } );  // this also correctly binds 'this.'

    // could unregister when view not visible and re-register when visible?
    context.subscriptions.push( vscode.workspace.onDidChangeTextDocument( async ( event ) => {
      if ( event.contentChanges.length ) {
        if ( this.view?.visible ) {
          void this.debouncedRefresh( this.filterQuery, TreeCache.IgnoreFilterAndAllNodes ).catch( err => {
            console.error( 'refresh failed', err );  // create a message notification ?
          } );
        }
        else {
          this.cache.set( event.document.uri,
            { refreshSymbols: true, filterQuery: '', allSymbols: [], filteredSymbols: [] } );
        }
      }
    } ) );

    // const sub1 = this.view?.onDidChangeSelection((event) => {
    // });

    context.subscriptions.push( vscode.workspace.onDidChangeConfiguration( e => {
      if ( e.affectsConfiguration( "symbolsTree.useTypescriptCompiler" ) ) {
        // if useTypescriptCompiler changed, cache needs to be nullified
        // but only for ts/tsx/js/jsx files, set uri's => null values
        this.cache.clearJSTSValues();
        if ( this.view?.visible ) this.refresh( this.filterQuery, TreeCache.IgnoreFilterAndAllNodes );
      }
    } ) );
  }

  public setView( view: vscode.TreeView<SymbolNode> ) {
    this.view = view;
    // this.view.message = "message";  // shown where the symbols would be
    // this.view.title = "title";  // could be the current file

    this.disposables.push( this.view?.onDidChangeSelection( async ( event ) => {
      if ( event.selection.length ) await vscode.commands.executeCommand( 'setContext', 'symbolsTree.hasSelection', true );
      else await vscode.commands.executeCommand( 'setContext', 'symbolsTree.hasSelection', false );
    } ) );

    // this fires on activation too
    this.disposables.push( this.view.onDidChangeVisibility( e => {
      vscode.commands.executeCommand( 'setContext', 'symbolsTree.visible', e.visible );
      const uri = vscode.window.activeTextEditor?.document.uri;

      if ( e.visible ) {
        if ( !SymbolsProvider.locked ) this.refresh( '', TreeCache.IgnoreFilterAndAllNodes );
        else if ( SymbolsProvider.locked && uri === SymbolsProvider.lockedUri ) this.refresh( '', TreeCache.UseFilterAndAllNodes );
      }
    } ) );
  }

  // refresh(): void {
  //   this._onDidChangeTreeData.fire();
  // }

  public setTitle( title: string = '' ) {
    if ( this.view ) this.view.title = title;
  }

  public async setLock( lock = true ) {
    if ( lock ) {
      SymbolsProvider.locked = true;
      await vscode.commands.executeCommand( 'setContext', 'symbolsTree.locked', true );

      SymbolsProvider.lockedUri = vscode.window.activeTextEditor?.document.uri;

      if ( this.view )
        this.view.title = "\u2007locked";  // \u2007 figure space: https://unicode-explorer.com/c/2007
    }
    else {  // unlock
      SymbolsProvider.locked = false;
      await vscode.commands.executeCommand( 'setContext', 'symbolsTree.locked', false );

      SymbolsProvider.lockedUri = undefined;

      if ( this.view )
        this.view.title = "";

      await this.refresh( '', TreeCache.UseFilterAndAllNodes );
    }
  }


  public async refresh( filterQuery: string[] | string, useCache: CacheUse = TreeCache.UseAllNodesIgnoreFilter ) {

    const _Globals = Globals.default;

    this.filterQuery = filterQuery;
    this.view!.message = undefined;

    const editor = vscode.window.activeTextEditor;
    const uri = editor?.document.uri || SymbolsProvider.lockedUri || this.cache.getLastVisitedUri();
    if ( !uri ) return;

    let docSymbols: SymbolNode[] | NodeTreeItem[];
    let treeSymbols: SymbolNode[] = [];

    // Map.get() can return undefined if key not found
    let thisUriCache: TreeCache | undefined = this.cache.get( uri );
    if ( thisUriCache && !this.filterQuery.length ) this.filterQuery = thisUriCache.filterQuery || '';

    if ( useCache === TreeCache.UseFilterAndAllNodes && thisUriCache && !thisUriCache.refreshSymbols ) {
      if ( thisUriCache.filterQuery.length ) {

        if ( thisUriCache.filteredSymbols.length ) {
          this.tree = thisUriCache.filteredSymbols as SymbolNode[];
          this._onDidChangeTreeData.fire();
          return;
        }
        else if ( thisUriCache.allSymbols.length )
          treeSymbols = thisUriCache.allSymbols as SymbolNode[];
      }
      else {
        if ( thisUriCache.allSymbols.length ) this.tree = thisUriCache.allSymbols as SymbolNode[];
        else this.tree = [];
        this._onDidChangeTreeData.fire();
        return;
      }
    }
    else if ( !filterQuery && useCache === TreeCache.UseAllNodesIgnoreFilter && thisUriCache && !thisUriCache.refreshSymbols ) {
      if ( thisUriCache.allSymbols.length ) this.tree = thisUriCache.allSymbols as SymbolNode[];
      else this.tree = [];
      this._onDidChangeTreeData.fire();
      return;
    }
    else if ( filterQuery && useCache === TreeCache.UseAllNodesIgnoreFilter && thisUriCache && !thisUriCache.refreshSymbols ) {
      if ( thisUriCache.allSymbols.length )
        treeSymbols = thisUriCache.allSymbols as SymbolNode[];
    }

    if ( _Globals.makeTreeView && _Globals.useTypescriptCompiler && _Globals.isJSTS ) {

      const doc = vscode.workspace.textDocuments.find( d => d.uri.toString() === uri.toString() );
      if ( !doc ) return;
      const nodes = await collectSymbolItemsFromSource( doc );
      if ( nodes?.length ) {
        docSymbols = await buildNodeTree( nodes ) as NodeTreeItem[];
        treeSymbols = toSymbolNodesFromNodeTreeItems( docSymbols, uri );
      }
      else {
        if ( this.view ) showTreeViewMessage( "Found no document symbols in this editor.", this.view );
        else showQuickPickMessage( "TreeView: Found no document symbols in this editor." );

        this.tree = [];
        this._onDidChangeTreeData.fire();
        return;
      }
    }
    else if ( _Globals.makeTreeView ) {
      // not getting .py symbols on opening vscode ExtensionHost unless 300ms
      // increase attempts or time if not js/ts/jsx/tsx ? editor.document.languageId.startsWith("javascript") or "typescript"
      // docSymbols = await getDocumentSymbolsWithRetry(uri, 6, 300) as SymbolNode[];
      docSymbols = await getDocumentSymbolsWithRetry( uri, [1, 2, 3, 4, 5, 6], 1000 ) as SymbolNode[];

      if ( docSymbols?.length )
        treeSymbols = toSymbolNodesNodefromDocumentSymbols( docSymbols, uri );
      else {
        if ( this.view ) showTreeViewMessage( "Found no document symbols in this editor.", this.view );
        else showQuickPickMessage( "TreeView: Found no document symbols in this editor." );

        this.tree = [];
        this._onDidChangeTreeData.fire();
        return;
      }
    }

    await this.attachParents( treeSymbols );

    if ( filterQuery.length > 0 ) {
      filteredTreeSymbols = await filterTree( filterQuery, treeSymbols );

      if ( !filteredTreeSymbols.length ) {
        showTreeViewMessage( "Found no matches for the filter query.", this.view! );
        // clear the tree or do nothing?
        this.tree = [];
        this._onDidChangeTreeData.fire();
        return;
      }
    }

    // rebuild cache
    if ( filterQuery.length > 0 && filteredTreeSymbols.length ) {
      this.tree = filteredTreeSymbols;
      this.cache.set( uri, { refreshSymbols: false, filterQuery: this.filterQuery, allSymbols: treeSymbols, filteredSymbols: filteredTreeSymbols } );
    }
    else {
      this.tree = treeSymbols;
      this.cache.set( uri, { refreshSymbols: false, filterQuery: this.filterQuery, allSymbols: treeSymbols, filteredSymbols: filteredTreeSymbols } );
    }

    this._onDidChangeTreeData.fire();
  }

  // use SymbolNode.children to assign SymbolNode.parent values
  private async attachParents( roots: SymbolNode[] ): Promise<void> {
    function walk( node: SymbolNode, parent?: SymbolNode ) {
      node.parent = parent;
      if ( node.children && node.children.length ) {
        for ( const child of node.children ) {
          walk( child, node );
        }
      }
    }

    for ( const root of roots ) {
      walk( root, undefined );
    }
  }

  // this needs getParent(element) to work
  public async expandAll(): Promise<void> {
    if ( this.view && this.tree.length ) {

      // this.tree.reverse() would mutate the original array, slice returns a copy of the original
      const reversed = this.tree.slice().reverse(); // or [...arr].reverse()

      // expand from the botton up, so last one expanded is the first node
      for ( const node of reversed ) {
        // Number.MAX_SAFE_INTEGER ensures full expansion
        try {
          await this.view.reveal( node, { expand: Number.MAX_SAFE_INTEGER, focus: false, select: false } );
        } catch ( e ) {
          // ignore reveal failures when tree not visible
        }
      }
    }
  }

  private async getSymbolAtCenterOfViewport(): Promise<SymbolNode | undefined> {
    const editor = vscode.window.activeTextEditor;
    if ( !editor ) return undefined;
    const visible = editor.visibleRanges[0];
    if ( !this.view || !this.tree.length || !visible ) return undefined;

    const middleLine = Math.floor( ( visible.start.line + visible.end.line ) / 2 );

    let middleSymbol: SymbolNode | undefined;
    let minimumDistance = Number.POSITIVE_INFINITY;

    function walk( symbols: SymbolNode[] ) {
      for ( const s of symbols ) {
        // consider the symbol's heading/start line for "nearest" semantics
        const dist = Math.abs( s.selectionRange.start.line - middleLine );
        if ( dist < minimumDistance ) {
          minimumDistance = dist;
          middleSymbol = s;
        }
        if ( s.children && s.children.length ) {
          walk( s.children );
        }
      }
    }

    walk( this.tree );
    return middleSymbol;
  }


  public async expandMiddleSymbol(): Promise<void> {

    if ( this.view && this.tree.length ) {

      let middleSymbol = await this.getSymbolAtCenterOfViewport();
      let middleSymbolOuterParent = this.tree[0];

      if ( middleSymbol ) {
        for ( const topNode of this.tree ) {
          if ( topNode.range.contains( middleSymbol.range ) ) middleSymbolOuterParent = topNode;
        }

        await this.view.reveal( middleSymbolOuterParent, { expand: Number.MAX_SAFE_INTEGER, focus: false, select: false } );
        await this.view.reveal( middleSymbol, { expand: Number.MAX_SAFE_INTEGER, focus: true, select: false } );
      }
    }
  }


  getParent( element: SymbolNode ): SymbolNode | null {
    return element.parent ?? null;
  }

  getTreeItem( element: SymbolNode ): vscode.TreeItem {

    // this._Globals.collapseTreeViewItems === "collapseOnOpen"/"expandOnOpen"
    const _Globals = Globals.default;

    const item = new vscode.TreeItem(
      element.name,

      element.children.length > 0
        ? ( _Globals.collapseTreeViewItems === "collapseOnOpen" ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded )
        : vscode.TreeItemCollapsibleState.None
    );

    item.command = {
      command: 'symbolsTree.revealSymbol',
      title: 'Reveal Symbol',
      arguments: [element]
    };
    item.contextValue = 'symbolNode';
    item.tooltip = `${element.name} — ${vscode.SymbolKind[element?.kind]}`;
    return item;
  }

  getChildren( element?: SymbolNode ): Thenable<SymbolNode[]> {
    if ( !element ) {
      return Promise.resolve( this.tree );
    }
    return Promise.resolve( element.children ?? [] );
  };


  public static kindToName( kind: vscode.SymbolKind ): string {
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

  public static kindToIcon( kind: vscode.SymbolKind ): string {
    switch ( kind ) {
      case vscode.SymbolKind.File: return 'symbol-file';
      case vscode.SymbolKind.Module: return 'symbol-module';
      case vscode.SymbolKind.Namespace: return 'symbol-namespace';
      case vscode.SymbolKind.Package: return 'symbol-package';
      case vscode.SymbolKind.Class: return 'symbol-class';
      case vscode.SymbolKind.Method: return 'symbol-method';
      case vscode.SymbolKind.Property: return 'symbol-property';
      case vscode.SymbolKind.Field: return 'symbol-field';
      case vscode.SymbolKind.Constructor: return 'symbol-constructor';
      case vscode.SymbolKind.Enum: return 'symbol-enum';
      case vscode.SymbolKind.Interface: return 'symbol-interface';
      case vscode.SymbolKind.Function: return 'symbol-function';
      case vscode.SymbolKind.Variable: return 'symbol-variable';
      case vscode.SymbolKind.Constant: return 'symbol-constant';
      case vscode.SymbolKind.String: return 'symbol-string';
      case vscode.SymbolKind.Number: return 'symbol-number';
      case vscode.SymbolKind.Boolean: return 'symbol-boolean';
      case vscode.SymbolKind.Array: return 'symbol-array';
      case vscode.SymbolKind.Object: return 'symbol-object';
      case vscode.SymbolKind.Key: return 'symbol-key';
      case vscode.SymbolKind.Null: return 'symbol-null';
      case vscode.SymbolKind.EnumMember: return 'symbol-enum-member';
      case vscode.SymbolKind.Struct: return 'symbol-struct';
      case vscode.SymbolKind.Event: return 'symbol-event';
      case vscode.SymbolKind.Operator: return 'symbol-operator';
      case vscode.SymbolKind.TypeParameter: return 'symbol-type-parameter';
      default: return 'symbol-object';
    }
  }

  public static nameToKind( name: string ): vscode.SymbolKind {
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

  dispose() {
    for ( const d of this.disposables ) d.dispose();
    this.debouncedRefresh.cancel?.();
  }
}

// async function getDocumentSymbolsWithRetry(uri: vscode.Uri, attempts = 6, delayMs = 200): Promise<vscode.DocumentSymbol[] | undefined> {
async function getDocumentSymbolsWithRetry( uri: vscode.Uri, attempts = [1, 2, 3, 4, 5, 6], delayMs = 200 ): Promise<SymbolNode[] | undefined> {

  for await ( const attempt of attempts ) {

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
    if ( symbols && symbols.length > 0 ) {
      return symbols as SymbolNode[];
    }
    // If provider returned empty array it might still be valid; still retry in case of initialization
    await new Promise( res => setTimeout( res, delayMs * ( 1 + attempt * 0.5 ) ) );
  }

  // for (let i = 0; i < attempts; i++) {
  // const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>(
  //   'vscode.executeDocumentSymbolProvider',
  //   uri
  // );
  // if (symbols && symbols.length > 0) {
  //   return symbols as SymbolNode[];
  // }
  // // If provider returned empty array it might still be valid; still retry in case of initialization
  // await new Promise(res => setTimeout(res, delayMs * (1 + i * 0.5)));
  // }
  return undefined;
}

// const toSymbolNodesNodefromDocumentSymbols = (ds: vscode.DocumentSymbol[], uri: vscode.Uri): SymbolNode[] =>

// if (!symbol.detail.length && symbol.kind === SymbolKind.String) {
//   const text = document.getText(symbol.range);
//   symbol.detail = text;
// }

const toSymbolNodesNodefromDocumentSymbols = ( ds: SymbolNode[], uri: vscode.Uri ): SymbolNode[] =>
  ds.map( s => ( {
    // name: s.name,
    // name: (vscode.window.activeTextEditor && s.kind === vscode.SymbolKind.String) ? s.name + ': ' + vscode.window.activeTextEditor.document.getText(s.range) : s.name,
    name: ( vscode.window.activeTextEditor && s?.kind === vscode.SymbolKind.String ) ? vscode.window.activeTextEditor.document.getText( s.range ) : s.name,
    detail: SymbolsProvider.kindToName( s?.kind ),   // e.g., 'class", 'function'
    kind: s?.kind,
    range: s.range,
    selectionRange: s.selectionRange,
    uri,
    // symbol children are returned in alphabetical order by vscode
    children: toSymbolNodesNodefromDocumentSymbols( s.children, uri ).sort( ( a, b ) => a.range.start.isBefore( b.range.start ) ? -1 : 1 ),
    parent: s.parent
  } ) );

// make SymbolNodes out of NodeTreeItems
const toSymbolNodesFromNodeTreeItems = ( ds: NodeTreeItem[], uri: vscode.Uri ): SymbolNode[] =>
  ds.map( s => ( {
    name: s.node.label,
    detail: s.node.detail,
    kind: SymbolsProvider.nameToKind( s.node?.kind ),
    range: s.node.range,
    selectionRange: s.node.selectionRange,
    uri,
    // parent: s.node.parent,
    // symbol children are returned in alphabetical order by vscode
    children: toSymbolNodesFromNodeTreeItems( s.children, uri ),
    // children: toNode(s.children, uri).sort((a, b) => a.range.start.isBefore(b.range.start) ? -1 : 1)
    parent: s.node.parent
  } ) );


// window.onDidChangeTextEditorVisibleRanges(e): (textEditor, visibleRanges)

// TextEditorCursorStyle.visibleRanges: readonly Range[]

