import * as vscode from 'vscode';


import type * as TS from "typescript";


// TS Usage:
// const offset = sourceFile.getPositionOfLineAndCharacter(line, column);
// const node = findNodeAtPosition(sourceFile, offset);
// TODO: does 'node' have the range info so no need to do below:
// const checker = program.getTypeChecker();
// const symbol = checker.getSymbolAtLocation(node);

export function findNodeAtPosition( node: TS.Node, pos: number ): TS.Node | undefined {
  if ( pos < node.getStart() || pos > node.getEnd() ) {
    return undefined;
  }

  for ( const child of node.getChildren() ) {
    const found = findNodeAtPosition( child, pos );
    if ( found ) return found;
  }

  return node; // deepest containing node
}


// VSCode DocumentSymbol Usage:
// const pos = new vscode.Position(line, column);
// const symbol = findSymbolAtPosition(symbols, pos);

export function findSymbolAtPosition( symbols: vscode.DocumentSymbol[], position: vscode.Position ): vscode.DocumentSymbol | undefined {
  for ( const sym of symbols ) {
    if ( sym.range.contains( position ) ) {
      // Search children first (deepest match wins)
      const child = findSymbolAtPosition( sym.children, position );
      return child ?? sym;
    }
  }
  return undefined;
}


// const editor = vscode.window.activeTextEditor;

// if ( editor && symbol ) {
//   editor.selection = new vscode.Selection( symbol.range.start, symbol.range.end );
//   editor.revealRange( symbol.range, vscode.TextEditorRevealType.InCenter );
// }

// select node? or symbol function here


/**
 * DocumentSymbol version
 * Selects only the body of the current symbol (excluding signature).
 */
// export async function selectCurrentSymbolBody() {
//   const editor = vscode.window.activeTextEditor;
//   if ( !editor ) return;

//   const document = editor.document;
//   const position = editor.selection.active;

//   const symbol = await findSymbolAtPosition( document, position );
//   if ( !symbol ) {
//     vscode.window.showInformationMessage( "No symbol found at cursor" );
//     return;
//   }

//   // Body starts after the signature (selectionRange)
//   const bodyStart = symbol.selectionRange.end;
//   const bodyEnd = symbol.range.end;

//   const bodyRange = new vscode.Range( bodyStart, bodyEnd );

//   editor.selection = new vscode.Selection( bodyRange.start, bodyRange.end );
//   editor.revealRange( bodyRange, vscode.TextEditorRevealType.InCenter );
// }


/**
 * DocuemntSymbol version
 * Returns the full symbol chain from root → leaf for the position.
 */
export async function getSymbolChain( document: vscode.TextDocument, position: vscode.Position ): Promise<vscode.DocumentSymbol[] | undefined> {

  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    document.uri
  );

  if ( !symbols ) return undefined;

  const chain: vscode.DocumentSymbol[] = [];

  function walk( list: vscode.DocumentSymbol[] ): boolean {
    for ( const sym of list ) {
      if ( sym.range.contains( position ) ) {
        chain.push( sym );
        return walk( sym.children ) || true;
      }
    }
    return false;
  }

  walk( symbols );
  return chain.length ? chain : undefined;
}


export async function getTopmostSymbol( document: vscode.TextDocument, position: vscode.Position ): Promise<vscode.DocumentSymbol | undefined> {
  const chain = await getSymbolChain( document, position );
  return chain ? chain[0] : undefined;
}

// same as getCurrentSymbol()
export async function getDeepestSymbol( document: vscode.TextDocument, position: vscode.Position ): Promise<vscode.DocumentSymbol | undefined> {
  const chain = await getSymbolChain( document, position );
  return chain ? chain[chain.length - 1] : undefined;
}


// function getTSSymbolAtPosition(
//   program: TS.Program,
//   sourceFile: TS.SourceFile,
//   line: number,
//   column: number
// ): TS.Symbol | undefined {

//   const checker = program.getTypeChecker();
//   const pos = sourceFile.getPositionOfLineAndCharacter( line, column );

//   const node = findNodeAtPosition( sourceFile, pos );
//   if ( !node ) return undefined;

//   return checker.getSymbolAtLocation( node );
// }


// function getTSBodyRange( node: TS.Node, sourceFile: TS.SourceFile ): vscode.Range | undefined {
//   const body = ( node as any ).body;
//   if ( !body ) return undefined;

//   const start = body.getStart( sourceFile );
//   const end = body.getEnd();

//   const startLC = sourceFile.getLineAndCharacterOfPosition( start );
//   const endLC = sourceFile.getLineAndCharacterOfPosition( end );

//   return new vscode.Range(
//     new vscode.Position( startLC.line, startLC.character ),
//     new vscode.Position( endLC.line, endLC.character )
//   );
// }


