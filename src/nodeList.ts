// import ts from "typescript";
import { window, TextDocument, Range, TreeItem, TreeItemCollapsibleState } from "vscode";
import type { NodePickItem, NodePickItems, NodeTreeItem, SymbolNode } from './types';
import * as Globals from './myGlobals';

let tsModulePromise: Promise<typeof import( "typescript" )> | null = null;
import type * as TS from "typescript";


export async function getTypescript () {
  if ( !tsModulePromise ) {
    tsModulePromise = import( "typescript" );
  }
  return tsModulePromise;
}


export async function collectSymbolItemsFromSource ( doc: TextDocument ): Promise<NodePickItems> {

  let ts: typeof import( "typescript" );

  try {
    ts = await getTypescript();
  } catch ( err ) {
    window.showErrorMessage(
      `Failed to load the TypeScript compiler: ${ err }`
    );
    return [];  // could fallback to non-tsc objects here
  }

  const sourceFile = ts.createSourceFile(
    doc.fileName,
    doc.getText(),
    ts.ScriptTarget.Latest,
    // the below IS USED and IMPORTANT, although it is in a comment !!
    /* setParentNodes */ true
  );

  const out: NodePickItems = [];

  function extractPropertyChain ( expr: TS.Expression ): string[] {
    const chain: string[] = [];
    let current: TS.Expression = expr;

    while ( ts.isPropertyAccessExpression( current ) || ts.isElementAccessExpression( current ) ) {
      if ( ts.isPropertyAccessExpression( current ) ) {
        chain.unshift( current.name.text );
        current = current.expression;
      } else if ( ts.isElementAccessExpression( current ) ) {
        const arg = current.argumentExpression;
        const key = ts.isStringLiteral( arg ) || ts.isNumericLiteral( arg )
          ? arg.text
          : arg.getText( sourceFile ); // fallback for computed keys  // **** souceFile here
        chain.unshift( key );
        current = current.expression;
      }
    }

    if ( ts.isIdentifier( current ) ) {
      chain.unshift( current.text );
    }

    return chain;
  }

  const container: string[] = [];
  const visited = new WeakSet<TS.Node>();

  // add interface, enum, constant, string, number, boolean, array, key

  function visitWithDepth ( node: TS.Node | undefined, depth: number, container: string[] ) {
    if ( !node ) return;
    if ( visited.has( node ) ) return;
    visited.add( node );

    // ts.isSourceFile(node)  // true for SourceFile

    const nameFrom = ( id: TS.Identifier | TS.StringLiteral | TS.NumericLiteral ) => id.text;
    const fullName = ( name: string ) => [ ...container, name ].join( "." );

    if ( ts.isFunctionDeclaration( node ) && node.name ) {
      const name = node.name.text;
      const newContainer = [ ...container, name ];
      const { asString } = getParameterDetails( ts, sourceFile, node.parameters, doc );

      out.push( {
        name: newContainer.join( "." ),
        kind: "declaration",
        depth,
        pos: node.name.getStart( sourceFile ),
        // end: node.name.getEnd(),
        range: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),
        selectionRange: new Range( doc.positionAt( node.name.getStart( sourceFile ) ), doc.positionAt( node.name.getEnd() ) ),
        label: `${ name } ( ${ asString } )`,
        detail: "function declaration",
        parent: depth ? node.parent : undefined
      } );

      // how is this different from node.forEachChild(child => recursiveFunction)
      node.body?.statements.forEach( stmt =>
        visitWithDepth( stmt, depth + 1, newContainer )
      );
    }

    // Arrow functions and function expressions
    else if ( ts.isArrowFunction( node ) || ts.isFunctionExpression( node ) ) {
      const name = "(anonymous)";
      const { asString } = getParameterDetails( ts, sourceFile, node.parameters, doc );

      out.push( {
        name: fullName( name ),
        kind: "anonymous",
        depth,
        pos: node.getStart( sourceFile ),
        // end: node.getEnd(),
        range: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),
        selectionRange: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getStart( sourceFile ) ) ),
        label: `( ${ asString } ) =>  `,
        detail: "anonymous function",
        parent: depth ? node.parent : undefined
      } );

      if ( ts.isBlock( node.body ) ) {
        node.body.statements.forEach( stmt =>
          visitWithDepth( stmt, depth + 1, [ ...container, name ] )
        );
      }
      return;
    }

    else if ( ts.isSwitchStatement( node ) ) {
      const text = node.expression.getText( sourceFile );

      out.push( {
        name: "switch",
        kind: "switch",
        depth,
        pos: node.getStart( sourceFile ),
        // end: node.name.getEnd(),
        range: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),
        selectionRange: new Range( doc.positionAt( node.expression.getStart( sourceFile ) ), doc.positionAt( node.expression.getStart( sourceFile ) ) ),
        label: `switch (${ text })`,
        detail: "switch",
        parent: depth ? node.parent : undefined
      } );
      if ( node.caseBlock.clauses ) {
        node.caseBlock.clauses.forEach( clause =>
          visitWithDepth( clause, depth + 1, [ ...container, "switch" ] )
        );
      }
    }

    else if ( ts.isCaseClause( node ) ) {
      const text = node.expression.getText( sourceFile );

      out.push( {
        name: "switch case",
        kind: "case",
        depth,
        pos: node.getStart( sourceFile ),
        // end: node.name.getEnd(),
        range: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),
        selectionRange: new Range( doc.positionAt( node.expression.getStart( sourceFile ) ), doc.positionAt( node.expression.getStart( sourceFile ) ) ),
        label: `case: ${ text }`,
        detail: "case",
        parent: depth ? node.parent : undefined
      } );
      node.statements.forEach( stmt =>
        visitWithDepth( stmt, depth + 1, [ ...container, text ] )
      );
    }

    else if ( ts.isDefaultClause( node ) ) {
      out.push( {
        name: "switch case default",
        kind: "case",
        depth,
        pos: node.getStart( sourceFile ),
        // end: node.name.getEnd(),
        range: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),
        selectionRange: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getStart( sourceFile ) ) ),
        label: `default: `,
        detail: "case",
        parent: depth ? node.parent : undefined
      } );
      node.statements.forEach( stmt =>
        visitWithDepth( stmt, depth + 1, [ ...container, 'default' ] )
      );
    }

    // Class declarations
    else if ( ts.isClassDeclaration( node ) && node.name ) {
      const name = nameFrom( node.name );

      let superString = "";  // A extends B, A implements B, A extends B implements C

      if ( node.heritageClauses ) {
        for ( const hc of node.heritageClauses ) {
          if ( hc.token === ts.SyntaxKind.ExtendsKeyword ) superString += ' extends ';
          else if ( hc.token === ts.SyntaxKind.ImplementsKeyword ) superString += ' implements ';

          for ( const t of hc.types ) {
            if ( ts.isIdentifier( t.expression ) ) {
              superString += t.expression.text;
            }
          }
        }
      }

      out.push( {
        name: fullName( name ),
        kind: "declaration",
        depth,
        pos: node.name.getStart( sourceFile ),
        // end: node.name.getEnd(),
        selectionRange: new Range( doc.positionAt( node.name.getStart( sourceFile ) ), doc.positionAt( node.name.getEnd() ) ),
        range: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),
        label: superString ? `${ name }${ superString }` : name,
        detail: "class declaration",
        parent: depth ? node.parent : undefined
      } );

      const classContainer = [ ...container, name ];

      node.members.forEach( member => {

        // class constructor
        if ( ts.isConstructorDeclaration( member ) ) {
          const { asString } = getParameterDetails( ts, sourceFile, member.parameters, doc );

          out.push( {
            name: [ ...classContainer, "constructor" ].join( "." ),
            kind: "constructor",
            depth: depth + 1,
            pos: member.getStart( sourceFile ),
            // end: member.getEnd(),
            range: new Range( doc.positionAt( member.getStart( sourceFile ) ), doc.positionAt( member.getEnd() ) ),
            selectionRange: new Range( doc.positionAt( member.getStart( sourceFile ) ), doc.positionAt( member.getStart( sourceFile ) ) ),
            label: `constructor ( ${ asString } )`,
            detail: `${ name } constructor`,
            parent: depth ? node.parent : undefined
          } );
          member.body?.statements.forEach( stmt =>
            visitWithDepth( stmt, depth + 2, [ ...classContainer, "constructor" ] )
          );
        }

        // class methods
        if ( ts.isMethodDeclaration( member ) && ts.isIdentifier( member.name ) ) {
          const methodName = member.name.text;
          const { asString } = getParameterDetails( ts, sourceFile, member.parameters, doc );

          out.push( {
            name: [ ...classContainer, methodName ].join( "." ),
            kind: "method",
            depth: depth + 1,
            pos: member.name.getStart( sourceFile ),
            // end: member.name.getEnd(),
            range: new Range( doc.positionAt( member.getStart( sourceFile ) ), doc.positionAt( member.getEnd() ) ),
            selectionRange: new Range( doc.positionAt( member.name.getStart( sourceFile ) ), doc.positionAt( member.name.getStart( sourceFile ) ) ),
            label: `${ methodName } ( ${ asString } )`,
            detail: `${ name } method`,
            parent: depth ? node.parent : undefined
          } );
          member.body?.statements.forEach( stmt =>
            visitWithDepth( stmt, depth + 2, [ ...classContainer, methodName ] )
          );
        }

        // class properties
        else if ( ts.isPropertyDeclaration( member ) && ts.isIdentifier( member.name ) ) {
          const propName = member.name.text;
          const initText = member.initializer?.getText( sourceFile );

          out.push( {
            name: [ ...classContainer, propName ].join( "." ),
            kind: "property",
            depth: depth + 1,
            pos: member.name.getStart( sourceFile ),
            // end: member.name.getEnd(),
            range: new Range( doc.positionAt( member.getStart( sourceFile ) ), doc.positionAt( member.getEnd() ) ),
            selectionRange: new Range( doc.positionAt( member.name.getStart( sourceFile ) ), doc.positionAt( member.name.getEnd() ) ),
            label: `${ propName } = ${ initText }`,
            detail: `${ name } property`,
            parent: depth ? node.parent : undefined
          } );
        }
      } );
    }

    else if (
      ts.isExpressionStatement( node ) &&
      ts.isBinaryExpression( node.expression ) &&
      node.expression.operatorToken?.kind === ts.SyntaxKind.EqualsToken
    ) {
      const left = node.expression.left;
      const right = node.expression.right;

      if (
        ( ts.isPropertyAccessExpression( left ) || ts.isElementAccessExpression( left ) ) &&
        ( ts.isArrowFunction( right ) || ts.isFunctionExpression( right ) )
      ) {
        const chain = extractPropertyChain( left ); // e.g. ['my'Object, 'prop1', 'prop1Func']
        const innerName = ts.isFunctionExpression( right ) && right.name?.getText( sourceFile );
        const body = right.body;
        let fullName = "";

        chain.forEach( ( segment, i ) => {
          fullName = fullName ? `${ fullName }.${ segment }` : segment;

          // noop ! if there is a preceding duplicate
          if ( out.length > 0 && out.find( ( item ) => item.name === fullName && item.depth === depth ) ) { }

          // myObj.prop1 = (arg1) => { }
          else {
            const leftStart = doc.positionAt( left.getStart( sourceFile ) );
            const leftEnd = doc.positionAt( left.getEnd() );

            const selectionRange = ts.isPropertyAccessExpression( left ) ?
              new Range(
                doc.positionAt( left.name.getStart( sourceFile ) ),
                doc.positionAt( left.name.getStart( sourceFile ) )
              ) :
              new Range(
                doc.positionAt( left.getStart( sourceFile ) ),
                doc.positionAt( left.getStart( sourceFile ) )
              );

            out.push( {
              name: fullName,
              kind: i === chain.length - 1 ? "method" : "object",
              depth: depth + i,
              pos: left.getStart( sourceFile ),
              range: new Range( leftStart, leftEnd ),

              // selectionRange: (left as TS.PropertyAccessExpression).name ?
              //   new Range(doc.positionAt((left as TS.PropertyAccessExpression).name.getStart(sourceFile)), doc.positionAt((left as TS.PropertyAccessExpression).name.getStart(sourceFile)))
              //   : new Range(doc.positionAt((left as TS.PropertyAccessExpression).getStart(sourceFile)), doc.positionAt((left as TS.PropertyAccessExpression).getStart(sourceFile))),

              selectionRange,
              label: segment,
              detail: i === chain.length - 1
                ? innerName
                  ? `assigned function '${ innerName }'`
                  : "assigned function"
                : "container object",
              parent: depth ? node.parent : undefined
            } );
          }
        } );

        // Append (anonymous) if function is unnamed
        if ( !innerName ) {
          const { asString } = getParameterDetails( ts, sourceFile, right.parameters, doc );

          const selectionRange = ts.isPropertyAccessExpression( left ) ?
            new Range(
              doc.positionAt( left.name.getStart( sourceFile ) ),
              doc.positionAt( left.name.getStart( sourceFile ) )
            ) :
            new Range(
              doc.positionAt( left.getStart( sourceFile ) ),
              doc.positionAt( left.getStart( sourceFile ) )
            );

          out.push( {
            name: `${ fullName } (anonymous)`,
            kind: "anonymous",
            depth: depth + chain.length,
            pos: right.getStart( sourceFile ),
            // end: right.getEnd(),

            range: new Range( doc.positionAt( left.getStart( sourceFile ) ), doc.positionAt( left.getEnd() ) ),
            // selectionRange: (left as TS.PropertyAccessExpression).name ?
            //   new Range(doc.positionAt((left as TS.PropertyAccessExpression).name.getStart(sourceFile)), doc.positionAt((left as TS.PropertyAccessExpression).name.getStart(sourceFile)))
            //   : new Range(doc.positionAt((left as TS.PropertyAccessExpression).getStart(sourceFile)), doc.positionAt((left as TS.PropertyAccessExpression).getStart(sourceFile))),

            selectionRange,
            label: `( ${ asString } ) =>  `,
            detail: "anonymous function",
            parent: depth ? node.parent : undefined
          } );
        } else {
          out.push( {
            name: innerName,
            kind: "function",
            depth: depth + chain.length,
            pos: right.name!.getStart( sourceFile ),  // coerce to non-null: Non‑null Assertion Operator
            // end: right.name!.getEnd(),

            range: new Range( doc.positionAt( right.getStart( sourceFile ) ), doc.positionAt( right.getEnd() ) ),
            selectionRange: right.name ?
              new Range( doc.positionAt( right.name.getStart( sourceFile ) ), doc.positionAt( right.name.getStart( sourceFile ) ) )
              : new Range( doc.positionAt( right.getStart( sourceFile ) ), doc.positionAt( right.getStart( sourceFile ) ) ),

            label: `${ innerName }()`,
            detail: "inner named function",
            parent: depth ? node.parent : undefined
          } );
        }

        if ( ts.isBlock( body ) ) {
          body.statements.forEach( stmt =>
            visitWithDepth( stmt, depth + chain.length, [ ...container, fullName ] )
          );
        }

        return;
      }

      // myObj.a = 13;
      else if ( ts.isPropertyAccessExpression( left ) && ts.isIdentifier( left.name ) ) {

        // noop: so that

        /* constructor(name, year) {
             this.name = "Arturo";   // in js/ts these aren't properties !
             this.year = 2050;       // but for tsc they are !
        } */

        // doesn't emit for name and year on separate lines
      }

      if ( isThisPropertyInConstructor( ts, left ) ) return;

      const chain = extractPropertyChain( left ); // e.g. ['my'Object, 'prop1', 'prop1Func']
      const value = right.getText( sourceFile );
      let fullName = chain.join( '.' );

      const leftStart = doc.positionAt( left.getStart( sourceFile ) );
      const leftEnd = doc.positionAt( left.getEnd() );

      const selectionRange = ts.isPropertyAccessExpression( left ) ?
        new Range(
          doc.positionAt( left.name.getStart( sourceFile ) ),
          doc.positionAt( left.name.getStart( sourceFile ) )
        ) :
        new Range(
          doc.positionAt( left.getStart( sourceFile ) ),
          doc.positionAt( left.getStart( sourceFile ) )
        );

      out.push( {
        name: fullName,
        kind: "property",
        depth: depth + 1,
        pos: left.getStart( sourceFile ),

        range: new Range( leftStart, leftEnd ),
        // selectionRange: (left as TS.PropertyAccessExpression).name ?
        //   new Range(doc.positionAt((left as TS.PropertyAccessExpression).name.getStart(sourceFile)), doc.positionAt((left as TS.PropertyAccessExpression).name.getStart(sourceFile)))
        //   : new Range(doc.positionAt((left as TS.PropertyAccessExpression).getStart(sourceFile)), doc.positionAt((left as TS.PropertyAccessExpression).getStart(sourceFile))),

        selectionRange,

        label: `${ chain.at( -1 ) }: ${ value }`,
        detail: "object property",
        parent: depth ? node.parent : undefined
      } );
    }

    // Variable statements
    else if ( ts.isVariableStatement( node ) ) {
      node.declarationList.declarations.forEach( decl =>
        visitWithDepth( decl, depth, container )
      );
    }

    // FunctionDeclaration: function foo() {}  (hit first above)
    // FunctionExpression: const foo = function() {}
    // ArrowFunction: const foo = ( ) => {}

    // Variable declarations: const myObj = {}; let bc = 13; export const square1 = x => x * x;
    else if ( ts.isVariableDeclaration( node ) && ts.isIdentifier( node.name ) ) {
      let isObj = false;
      let kind = "";
      let label = "";
      let detail = "";

      const name = node.name.text;
      const init = node.initializer;

      if ( init && ts.isArrowFunction( init ) ) {
        kind = "arrow";
        // label = `${name} ( ${getParameterDetails(ts, sourceFile, (init as ts.FunctionExpression).parameters, doc).asString} )`;
        label = `${ name } ( ${ getParameterDetails( ts, sourceFile, ( init ).parameters, doc ).asString } )`;
        detail = "variable ➜ arrow function";
      }
      else if ( init && ts.isFunctionExpression( init ) ) {
        kind = "function";
        // label = `${name} ( ${getParameterDetails(ts, sourceFile, (init as TS.FunctionExpression).parameters, doc).asString} )`;
        label = `${ name } ( ${ getParameterDetails( ts, sourceFile, init.parameters, doc ).asString } )`;
        detail = "variable ➜ function";
      }
      else if ( init && ts.isPropertyAccessExpression( init ) ) {
        kind = "property";
        label = `${ name } = ${ init?.getText( sourceFile ) }`;
        detail = "variable ➜ object property";
      }
      // else if (init && ts.isCallExpression(init) && ts.isPropertyAccessExpression((init as TS.CallExpression).expression)) {
      else if ( init && ts.isCallExpression( init ) && ts.isPropertyAccessExpression( init.expression ) ) {
        kind = "call";

        label = `${ name } = ${ init?.getText( sourceFile ) }`;
        detail = "variable ➜ method call";
      }
      else if ( init && ts.isObjectLiteralExpression( init ) ) {
        isObj = true;
        kind = "object";
        label = name;
        detail = "variable ➜ object";
      }
      else {
        kind = "variable";
        label = `${ name } = ${ init?.getText( sourceFile ) }`;
        detail = ( init && ts.isNewExpression( init ) ) ? "variable ➜ new()" : "variable";  //  isNewExpression = 215
      }

      out.push( {
        name,
        kind,
        depth,
        pos: node.getStart( sourceFile ),
        // end: node.name.getEnd(),
        range: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),
        selectionRange: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getStart( sourceFile ) ) ),
        label,
        detail,
        parent: depth ? node.parent : undefined
      } );

      if (
        init &&
        ( ts.isArrowFunction( init ) || ts.isFunctionExpression( init ) ) && ts.isBlock( init.body )
      ) {
        init.body.statements.forEach( stmt =>
          visitWithDepth( stmt, depth + 1, [ ...container, name ] )
        );
      }

      if ( init && isObj ) { // check if the object is empty
        visitWithDepth( init, depth + 1, [ ...container, name ] );
      }
      return;
    }

    // Object literals: const myObj2 = { func: ( ) =>... }
    else if ( ts.isObjectLiteralExpression( node ) ) {
      node.properties.forEach( prop => {

        if ( ( ts.isPropertyAssignment( prop ) || ts.isMethodDeclaration( prop ) ) && ts.isIdentifier( prop.name ) ) {
          let init: TS.Expression | undefined;
          const name = prop.name.text;
          if ( ts.isPropertyAssignment( prop ) ) init = prop.initializer;

          const isMethod = ts.isMethodDeclaration( prop );

          const isFunc =  // init !== undefined
            !!init &&
            ( ts.isArrowFunction( init ) || ts.isFunctionExpression( init ) );

          // to use as a type guard
          // function isFunctionLikeInit( init: TS.Expression | undefined ): init is TS.ArrowFunction | TS.FunctionExpression {
          //   return !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
          // }

          // else if (isFunctionLikeInit(init)) {
          //   paramsText = getParameterDetails(
          //     ts,
          //     sourceFile,
          //     init.parameters,
          //     doc
          //   ).asString;
          // }

          const isObj = !!init && ts.isObjectLiteralExpression( init );  // nested objects
          const isVar = !isFunc && !isObj && !isMethod;

          let initText;
          let paramsText: string | undefined;

          if ( isVar ) initText = init?.getText( sourceFile );
          else if ( init && ( ts.isArrowFunction( init ) || ts.isFunctionExpression( init ) ) ) {
            paramsText = getParameterDetails(
              ts,
              sourceFile,
              init.parameters,
              doc
            ).asString;
          }
          else if ( isMethod ) paramsText = getParameterDetails( ts, sourceFile, prop.parameters, doc ).asString;

          out.push( {
            name: fullName( name ),
            kind: ( isFunc || isMethod ) ? "method" : isObj ? "object" : "property",
            depth,
            pos: prop.name.getStart( sourceFile ),
            // end: prop.name.getEnd(),
            range: new Range( doc.positionAt( prop.getStart( sourceFile ) ), doc.positionAt( prop.getEnd() ) ),
            selectionRange: new Range( doc.positionAt( prop.name.getStart( sourceFile ) ), doc.positionAt( prop.name.getStart( sourceFile ) ) ),
            label: isFunc ? `${ prop.name.text }: ( ${ paramsText } )` : isVar ? `${ prop.name.text }: ${ initText }` : prop.name.text,
            detail: ( isFunc || isMethod ) ? "object method" : isObj ? "nested object" : "object property",
            parent: depth ? node.parent : undefined
          } );

          // are the next 3 conditionals handled by node.forEachChild(child => visitWithDepth(stmt, depth + 1, [...container, name]) ??
          // const numChildren = node.getChildCount(sourceFile);
          // const children = node.getChildren(sourceFile);

          // this handles let myVariable = { method1: function (inMethod1) { ...variables and properties in here...} }
          if ( ts.isFunctionLike( init ) && init.body && ts.isBlock( init.body ) ) {
            init.body.statements.forEach( ( stmt: TS.Statement ) =>
              visitWithDepth( stmt, depth + 1, [ ...container, name ] )
            );
          }
          // else if (isMethod && prop.body && ts.isBlock(prop.body as TS.Node)) {
          else if ( isMethod && prop.body ) {
            prop.body.statements.forEach( stmt =>
              visitWithDepth( stmt, depth + 1, [ ...container, name ] )
            );
          }

          if ( init && isObj ) {  // if object is empty skip this ?
            visitWithDepth( init, depth + 1, [ ...container, name ] );
          }
        }
      } );
      return;
    }

    // Expression statements
    else if ( ts.isExpressionStatement( node ) ) {
      visitWithDepth( node.expression, depth, container );
      return;
    }

    // Call expressions:  simple("howdy") or myObject/myClass.method(arg1)
    else if ( ts.isCallExpression( node ) ) {
      const expr = node.expression;
      const { asString } = getParameterDetails( ts, sourceFile, node.arguments, doc );
      let name = '', propName = '', label = '', detail = '';

      if ( ts.isPropertyAccessExpression( expr ) ) {   // for myObject/myClass.method(arg1)
        propName = expr.getText( sourceFile );
        name = fullName( propName );
        label = `${ propName } ( ${ asString } )`;
        detail = `${ expr.expression.getText( sourceFile ) } method call`;
      }
      else if ( ts.isIdentifier( expr ) ) {   // simple("howdy")
        name = fullName( expr.text );
        label = `${ expr.text } ( ${ asString } )`;
        detail = 'call';
      }

      if ( ts.isIdentifier( expr ) || ts.isPropertyAccessExpression( expr ) ) {  // rex.speak() not caught
        out.push( {
          name,
          kind: "call",
          depth,
          pos: expr.getStart( sourceFile ),
          // end: expr.getEnd(),
          range: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),
          selectionRange: new Range( doc.positionAt( expr.getStart( sourceFile ) ), doc.positionAt( expr.getStart( sourceFile ) ) ),
          label,
          detail,
          parent: depth ? node.parent : undefined
        } );
      }
      node.arguments.forEach( arg => visitWithDepth( arg, depth + 1, container ) );
      return;
    }

    // Return statements
    else if ( ts.isReturnStatement( node ) ) {
      const path = getAllEnclosingFunctionNames( ts, node );

      out.push( {
        name: "return",
        kind: "return",
        depth,
        pos: node.getStart( sourceFile ),
        // end: expr.getEnd(),

        range: new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),
        selectionRange: ( node.expression ) ? new Range( doc.positionAt( node.expression.getStart( sourceFile ) ), doc.positionAt( node.expression.getEnd() ) )
          : new Range( doc.positionAt( node.getStart( sourceFile ) ), doc.positionAt( node.getEnd() ) ),

        label: `${ node.getText() }`,
        detail: path ? `${ path.join( ' > ' ) } > return` : "return",
        parent: depth ? node.parent : undefined
      } );

      if ( node.expression ) visitWithDepth( node.expression, depth + 1, container );
      return;
    }

    // recurse
    ts.forEachChild( node, child => visitWithDepth( child, depth, container ) );
  }

  visitWithDepth( sourceFile, 0, container );  // the starting point 

  return out.sort( ( a, b ) => a.pos - b.pos );
}


// function getParameterDetails( ts: typeof import( "typescript" ), sourceFile: TS.SourceFile, params: TS.NodeArray<TS.ParameterDeclaration | TS.Expression>, doc: TextDocument ): { selectionRange: Range | undefined; asString: string; } {
function getParameterDetails ( ts: typeof import( "typescript" ), sourceFile: TS.SourceFile, params: TS.NodeArray<TS.ParameterDeclaration | TS.Expression>, doc: TextDocument ): { selectionRange: Range | undefined; asString: string; } {

  let start, end;
  const asString = params.map( p => {
    // TS.Expression has no name property
    if ( ts.isParameter( p ) )
      return p.name.getText( sourceFile );  // this will not get type info, p.getText( sourceFile ) does
  } )
    .join( ', ' );

  if ( params.length >= 1 ) {
    start = params[ 0 ].getStart( sourceFile );
    end = params.at( -1 )!.getEnd();  // coerce to non-null: Non‑null Assertion Operator
    return {
      asString,
      selectionRange: new Range( doc.positionAt( start ), doc.positionAt( end ) )
    };
  }

  return {      // what is this return used for ?
    asString,
    selectionRange: new Range( doc.positionAt( params.pos ), doc.positionAt( params.pos ) )
  };
}


function isThisPropertyInConstructor ( ts: typeof import( "typescript" ), node: TS.Node ): boolean {
  if ( !ts.isPropertyAccessExpression( node ) ) return false;
  if ( node.expression?.kind !== ts.SyntaxKind.ThisKeyword ) return false;

  let current: TS.Node | undefined = node.parent;
  while ( current ) {
    if ( ts.isConstructorDeclaration( current ) ) {
      // Ensure this constructor belongs to a class
      return ts.isClassLike( current.parent );
    }
    // Stop climbing at the class boundary — avoids matching nested fns
    if ( ts.isClassLike( current ) ) break;
    current = current.parent;
  }
  return false;
}


/**
 * For 'return's.
 * Walks up from `node` and returns an array of all enclosing
 * function or method names, from outermost to innermost.
 */
export function getAllEnclosingFunctionNames ( ts: typeof import( "typescript" ), node: TS.Node, ): string[] {
  const names: string[] = [];
  let cur: TS.Node | undefined = node.parent;

  while ( cur ) {
    // Named function declaration: function foo() { … }
    // Class declaration
    if ( ( ts.isFunctionDeclaration( cur ) || ts.isClassDeclaration( cur ) ) && cur.name ) {
      names.push( cur.name.text );
    }
    // Object: const myObj2 = {  }  // works for highest level myObj2
    else if ( ts.isVariableDeclaration( cur ) && ts.isIdentifier( cur.name ) ) {
      names.push( cur.name.text );
    }

    // methods and properties within objects: const myObj2 = { method1: return } 
    else if ( ts.isPropertyAssignment( cur ) && ts.isIdentifier( cur.name ) ) {
      names.push( cur.name.text );
    }

    // Class method / getter / setter: class C { bar() { } }
    else if (
      ( ts.isMethodDeclaration( cur ) ||
        ts.isGetAccessor( cur ) ||
        ts.isSetAccessor( cur ) ) &&
      ts.isIdentifier( cur.name )
    ) {
      names.push( cur.name.text );
    }
    // FunctionExpression or ArrowFunction assigned to a variable:
    //    const baz = function() { … }  or  const qux = () => { … }
    else if (
      ( ts.isFunctionExpression( cur ) || ts.isArrowFunction( cur ) ) &&
      ts.isVariableDeclaration( cur.parent ) &&
      ts.isIdentifier( cur.parent.name )
    ) {
      names.push( cur.parent.name.text );
    }

    cur = cur.parent;
  }

  // Reverse so that outermost function appears first
  return names.reverse();
}

export async function buildNodeTree ( items: NodePickItem[] ): Promise<NodeTreeItem[]> {

  const _Globals = Globals.default;

  const roots: NodeTreeItem[] = [];
  const stack: NodeTreeItem[] = [];

  for ( const [ index, item ] of items.entries() ) {
    const next = items[ index + 1 ];
    const hasChild = next?.depth === item.depth + 1;

    const treeItem = new TreeItem(
      `${ item.label } • ${ item.detail }`,
      hasChild
        ? ( _Globals.collapseTreeViewItems === "collapseOnOpen" ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded )
        : TreeItemCollapsibleState.None
    );

    treeItem.tooltip = `${ item.kind } • ${ item.detail }`;
    treeItem.description = item.name;

    const wrapped: NodeTreeItem = {
      ...treeItem,
      node: item,
      children: []
    };

    // Pop back up until stack depth matches this item’s depth
    while ( stack.length > item.depth ) {
      stack.pop();
    }

    if ( stack.length === 0 ) {
      roots.push( wrapped );
    } else {
      stack[ stack.length - 1 ].children.push( wrapped );
    }

    stack.push( wrapped );
  }

  return roots;
}



function nodeMatches ( node: SymbolNode, query: string[] | string ): boolean {
  if ( typeof query === 'string' ) {
    return node.name.toString().includes( query ) || !!node.detail?.includes( query );
  }
  else {
    return query.some( q => node.name.toString().includes( q ) || !!node.detail?.includes( q ) );
  }
}


/**
 * Return a new SymbolNode with pruned children (only matches/descendant-matches).
 * Returns null if neither node nor any descendant matches.
 * Returns the parent nodes, NOT just matching child nodes.
 */
function pruneNode ( node: SymbolNode, query: string[] | string ): SymbolNode | null {
  const matchesSelf = nodeMatches( node, query );

  // Recurse children and keep only those that return non-null
  const prunedChildren: SymbolNode[] = [];
  if ( node.children?.length ) {
    for ( const child of node.children ) {
      const pruned = pruneNode( child, query );
      if ( pruned ) prunedChildren.push( pruned );
    }
  }

  // If this node matches or any child matched, return a (shallow) copy with pruned children
  if ( matchesSelf || prunedChildren.length > 0 ) {
    // create a shallow copy of the node; keep other properties as-is
    const copy: SymbolNode = {
      ...node,
      children: prunedChildren,
      // parent will be fixed up by caller if needed; keep undefined to avoid cross-linking
      parent: undefined
    };
    // Optionally, set parent links for children
    for ( const child of copy.children ) {
      child.parent = copy;
    }
    return copy;
  }

  // no match in this subtree
  return null;
}

export async function filterTree ( query: string[] | string, items: SymbolNode[] ): Promise<SymbolNode[]> {

  const out: SymbolNode[] = [];
  for ( const root of items ) {
    const pruned = pruneNode( root, query );
    if ( pruned ) out.push( pruned );
  }
  return out;
}