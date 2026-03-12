import { TextDocument, Range, DocumentSymbol, SymbolKind } from 'vscode';
import * as ts from 'typescript';


/**
 * Make DocumentSymbols[] from arrow functions and other function "variables",
 * like const someFunc = function () {}; or const square1 = x => x * x;
 */
export async function makeSymbolsFromFunctionExpressions ( document: TextDocument ): Promise<DocumentSymbol[] | undefined> {

  const arrowFunctionSymbols: DocumentSymbol[] = [];

  const program = ts.createProgram( [ document.fileName ], { allowJs: true } );
  const sourceFile = program.getSourceFile( document.fileName );
  const checker = program.getTypeChecker();
  if ( !sourceFile ) return;

  function visit ( node: ts.Node ) {

    // e.g., const someFunc = function () {};
    // ts.isVariableStatement(node);  // true for the above
    // node.declarationList.declarations[0].initializer.kind === 201 a FunctionExpression

    let parameters;

    const symbol = checker.getSymbolAtLocation( node );
    if ( symbol ) {
      const type = checker.getTypeOfSymbolAtLocation( symbol, node );
      const signatures = type.getCallSignatures();
      for ( const sig of signatures ) {
        parameters = sig.getParameters();
      }
    }

    if ( ts.isVariableStatement( node ) && node.declarationList.declarations[ 0 ].initializer ) {
      if ( ts.isFunctionExpression( node.declarationList.declarations[ 0 ].initializer ) ) {

        const triviaWidth = node.declarationList.declarations[ 0 ].initializer.getLeadingTriviaWidth( sourceFile );

        const startPos = document.positionAt( node.declarationList.declarations.pos ).translate( { characterDelta: triviaWidth } );
        // use this to match the symbol locations provided by vscode documentSymbol
        const fullRange = new Range( startPos, document.positionAt( node.declarationList.declarations.end ) );

        const end = node.declarationList.declarations[ 0 ].name?.getEnd();

        // make a DocumentSymbol
        const newSymbol = {
          name: String( node.declarationList.declarations[ 0 ].name?.getText( sourceFile ) ),
          kind: SymbolKind.Function,
          range: fullRange,
          selectionRange: new Range( startPos, document.positionAt( end || node.declarationList.declarations.end ) ),
          children: [],
          detail: '',
          parameters: parameters
        };

        arrowFunctionSymbols.push( newSymbol );
      }
    }

    // e.g., const square1 = x => x * x;  initializer is x => x * x
    // any space/jsdoc, etc. before the name (square1) is trivia

    else if ( ts.isVariableDeclaration( node ) && !!node.initializer && ts.isArrowFunction( node.initializer ) ) {
      if ( document ) {

        // getLeadingTriviaWidth() needs to have the sourceFile parameter to work
        // see https://stackoverflow.com/a/67810822/836330 and 
        // https://github.com/microsoft/TypeScript/issues/14808#issuecomment-289020765

        const triviaWidth = node.name.end - node.name.pos - node.name.getText( sourceFile ).length;

        // const triviaWidth = node.initializer.getLeadingTriviaWidth(sourceFile);
        // above DOES NOT handle "const /** @type { any } */ square2 = x => x * x;" correctly

        const startPos = document.positionAt( node.pos ).translate( { characterDelta: triviaWidth } );
        const fullRange = new Range( startPos, document.positionAt( node.end ) );

        const newSymbol = {
          name: String( node.name.getText( sourceFile ) ),
          kind: SymbolKind.Function,
          range: fullRange,
          selectionRange: new Range( startPos, document.positionAt( node.name.end ) ),
          detail: '',
          children: [],
          parameters: parameters
        };

        arrowFunctionSymbols.push( newSymbol );
      }
    }

    ts.forEachChild( node, visit );
  }

  visit( sourceFile );

  return arrowFunctionSymbols;
};