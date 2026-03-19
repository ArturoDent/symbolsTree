import {
	ExtensionContext, commands, window,
	Range, Selection, TextEditorRevealType, TreeView
} from 'vscode';
import { SymbolsProvider } from './tree';
import { SymbolPicker, trackQuickPickVisibility } from './quickPick';
import { showSimpleMessage } from './messages';
import {
	getNextRevealTarget,
	getNextRevealTargetFromSymbol,
	getNextSymbolTarget,
	getNextSymbolTargetFromSymbol,
	makeRevealSelectionFromSymbol,
	makeSelectionFromSymbol,
	resetSelectionCycle
} from './symbolLocation';
import * as Globals from './myGlobals';

const _Globals = Globals.default;

import type { SymMap, SymbolNode, ReturnSymbols } from './types';
import { TreeCache } from './types';
import { registerSymbolCache } from './sharedSymbolCache';

let symbolView: TreeView<SymbolNode>;


export async function activate ( context: ExtensionContext ) {

	await _Globals.init( context );
	registerSymbolCache( context );
	let treeSymbolProvider: SymbolsProvider;

	if ( _Globals.makeTreeView ) {
		treeSymbolProvider = new SymbolsProvider( context );
		symbolView = window.createTreeView( 'symbolsTree', { treeDataProvider: treeSymbolProvider, canSelectMany: true, showCollapseAll: false } );
		treeSymbolProvider.setView( symbolView );

		// initialize context keys
		await commands.executeCommand( 'setContext', 'symbolsTree.quickPickVisible', false );

		await commands.executeCommand( 'setContext', 'symbolsTree.locked', false );
		await commands.executeCommand( 'setContext', 'symbolsTree.filtered', false );

		await commands.executeCommand( 'setContext', 'symbolsTree.hasSelection', false );
		await commands.executeCommand( 'setContext', 'symbolsTree.collapsed', false );

		context.subscriptions.push( symbolView );
		context.subscriptions.push( treeSymbolProvider );
	}

	// this could be delayed (and disposed of) in the symbolsTree.showQuickPick() command
	const symbolPicker = new SymbolPicker( context );  // the QuickPick class
	const qpTracker = trackQuickPickVisibility( symbolPicker.qp );
	context.subscriptions.push( symbolPicker );

	context.subscriptions.push(    // register QuickPick commands

		commands.registerCommand( 'symbolsTree.refreshQuickPick', async ( args: any ) => {
			if ( qpTracker.visible )
				await commands.executeCommand( "symbolsTree.showQuickPick" );
		} ),

		commands.registerCommand( 'symbolsTree.showQuickPick', async ( args: any ) => {

			if ( qpTracker.visible ) return;  // noop if alreadu open

			const document = window.activeTextEditor?.document;
			if ( !document ) return;  // message?

			// if (args.symbols) {  // excludes 'symbols': '' which is right
			// 	query = removeEmptyStringsFromQuery(args.symbols);   // remove empty strings

			// 	if (!query!.length) {
			// 		showSimpleMessage("There is no query in your keybinding after removing empty strings.");
			// 		return;
			// 	}
			// }

			let symbols: ReturnSymbols | undefined;

			let kbSymbols: ( keyof SymMap )[];
			// if triggered from Command Palette, args is undefined

			if ( !!args?.symbols && !Array.isArray( args?.symbols ) ) args.symbols = [ args.symbols ];
			else if ( Array.isArray( args?.symbols ) && args?.symbols?.length === 0 ) args.symbols = undefined;
			// default is all symbols

			kbSymbols = args?.symbols || undefined;

			// if "javascript" and useTSC setting = true
			if ( _Globals.isJSTS && _Globals.useTypescriptCompiler )
				symbols = await symbolPicker.getNodes( kbSymbols, document ); // NodePickItem[] | undefined = NodePickItems
			else
				symbols = await symbolPicker.getSymbols( kbSymbols, document ); // Map<DocumentSymbol, number> | undefined = SymbolMap

			// const query = removeEmptyStringsFromQuery(args);   // remove empty strings

			// if (!query?.length) {
			// 	showSimpleMessage("There is no query in your keybinding after removing empty strings.");
			// }

			// .length?
			// if (symbols?.filteredSymbols) await symbolPicker.render(symbols.filteredSymbols, true);
			if ( symbols?.filteredSymbols ) await symbolPicker.render( symbols, true );
		} ) );


	context.subscriptions.push(    // register Tree View commands

		// from keybinding only
		commands.registerCommand( 'symbolsTree.applyFilter', async ( args: any ) => {

			if ( !window.activeTextEditor ) {
				showSimpleMessage( "There is no text editor open." );
				return;
			}

			// this handles both an empty array and an empty string
			// but not an array with only an empty string member, 
			// that is handled in removeEmptyStringsFromQuery()
			if ( !args || !args.length ) {
				showSimpleMessage( "You need an 'args' option in your 'symbolsTree.applyFilter' keybinding. Opening a QuickInput to get your filter." );
				await commands.executeCommand( 'symbolsTree.getFilter' );
				return;
			}

			const query = removeEmptyStringsFromQuery( args );   // remove empty strings

			if ( !query?.length ) {
				showSimpleMessage( "There is no query in your keybinding after removing empty strings." );
			}
			else {
				await treeSymbolProvider.refresh( query, TreeCache.UseAllNodesIgnoreFilter );
			}
		} ),

		commands.registerCommand( 'symbolsTree.refreshTree', async () => {

			// refresh will unlock if locked
			if ( SymbolsProvider.locked ) {
				SymbolsProvider.locked = false;
				await commands.executeCommand( 'setContext', 'symbolsTree.locked', false );
				SymbolsProvider.lockedUri = undefined;
				treeSymbolProvider.setTitle( "" );
			}

			await treeSymbolProvider.refresh( '', TreeCache.IgnoreFilterAndAllNodes );  // true = ignoreCache

			if ( _Globals.collapseTreeViewItems === "expandOnOpen" ) {
				await treeSymbolProvider.expandAll();
				await commands.executeCommand( 'setContext', 'symbolsTree.collapsed', false );

				// reveal where cursor is ?
				// await symbolProvider.expandMiddleSymbol();
			}
			else {
				await commands.executeCommand( 'workbench.actions.treeView.symbolsTree.collapseAll' );
				await commands.executeCommand( 'setContext', 'symbolsTree.collapsed', true );
				// await symbolProvider.expandMiddleSymbol();
			}
		} ),

		commands.registerCommand( 'symbolsTree.lock', async () => {
			await treeSymbolProvider.setLock( true );
		} ),

		commands.registerCommand( 'symbolsTree.unlock', async () => {
			await treeSymbolProvider.setLock( false );
		} ),

		commands.registerCommand( 'symbolsTree.getFilter', async () => {

			// to make a keybinding that focuses and opens a find input
			// undefined is not allowed but works
			// await symbolView.reveal(undefined, {select: false, focus: true});
			// await commands.executeCommand('list.find');  // must be awaited to get focus in the find input

			let finalQuery: string | string[] = '';

			// open the QuickInput and create a filtered TreeItem[]
			let query = await window.showInputBox();

			if ( !query?.length ) {
				showSimpleMessage( "There is no query from your input after removing empty strings." );
				return;
			}

			// handle "case && call" => do successive searches, not implemented yet
			// handle "class || rex"  => ["class", "rex"] // if query contains "||" split on " || "
			// handle "class,rex" treat as an OR
			const orRE = new RegExp( "\\s*\\|\\|\\s*" );
			const commaRE = new RegExp( "\\s*,\\s*" );

			if ( query?.includes( '||' ) ) finalQuery = query.split( orRE );
			else if ( query?.includes( ',' ) ) finalQuery = query.split( commaRE );
			else finalQuery = query;

			if ( finalQuery.length ) {

				// finalQuery can include an empty string if input 'class ||  '
				const query = removeEmptyStringsFromQuery( finalQuery );   // remove empty strings
				if ( query?.length ) await treeSymbolProvider.refresh( query, TreeCache.IgnoreFilter );
				else showSimpleMessage( "There is no query from your input after removing empty strings." );
			}
		} ),

		commands.registerCommand( 'symbolsTree.collapseAll', async ( node: SymbolNode ) => {
			await commands.executeCommand( 'workbench.actions.treeView.symbolsTree.collapseAll' );
			await commands.executeCommand( 'setContext', 'symbolsTree.collapsed', true );
		} ),

		commands.registerCommand( 'symbolsTree.expandAll', async ( node: SymbolNode ) => {
			await treeSymbolProvider.expandAll();
			await commands.executeCommand( 'setContext', 'symbolsTree.collapsed', false );
		} ),

		commands.registerCommand( 'symbolsTree.revealSymbol', async ( node: SymbolNode ) => {

			const editor = window.activeTextEditor;
			if ( !editor ) return;

			const treeSelection = symbolView?.visible ? symbolView.selection : [];
			const treeSingleSelection = treeSelection.length === 1 ? treeSelection[ 0 ] : undefined;

			const selectionMatchesSingleTreeNode = !!treeSingleSelection
				&& treeSingleSelection.uri.toString() === editor.document.uri.toString()
				&& ( () => {
					const treeNodeSelection = makeRevealSelectionFromSymbol( editor, treeSingleSelection );
					return editor.selection.anchor.isEqual( treeNodeSelection.anchor )
						&& editor.selection.active.isEqual( treeNodeSelection.active );
				} )();

			const singleTreeNode = node || ( selectionMatchesSingleTreeNode ? treeSingleSelection : undefined );
			const shouldUseTreeSelection = !!node || treeSelection.length > 1 || !!singleTreeNode;

			if ( singleTreeNode && singleTreeNode.uri.toString() === editor.document.uri.toString() ) {
				const target = getNextRevealTargetFromSymbol( editor, singleTreeNode );
				if ( target ) {
					editor.selection = target.selection;
					editor.revealRange( target.symbol.range, TextEditorRevealType.InCenterIfOutsideViewport );
					if ( symbolView?.visible ) {
						await symbolView.reveal( target.symbol, { expand: undefined, focus: false, select: true } );
					}
					await window.showTextDocument( editor.document );
					return;
				}
			}

			if ( !shouldUseTreeSelection ) {
				const target = await getNextRevealTarget( editor );

				if ( !target ) {
					showSimpleMessage( "Found no symbol at the current cursor position." );
					return;
				}

				editor.selection = target.selection;
				editor.revealRange( target.symbol.range, TextEditorRevealType.InCenterIfOutsideViewport );
				if ( symbolView?.visible ) {
					await symbolView.reveal( target.symbol, { expand: undefined, focus: false, select: true } );
				}
				await window.showTextDocument( editor.document );
				return;
			}

			if ( !node && !treeSelection.length ) {
				showSimpleMessage( "There are no symbols selected in the Tree View to reveal." );
				return;
			}

			resetSelectionCycle();

			let nodeToReveal: SymbolNode | undefined = undefined;
			if ( node ) nodeToReveal = node;
			else nodeToReveal = treeSelection[ 0 ];

			let selections: Selection[] = [];
			let nodes: SymbolNode[] = [];

			if ( node ) {
				if ( treeSelection.includes( node ) ) nodes.push( ...treeSelection );
				else nodes.push( node );
			}
			else nodes.push( ...treeSelection );

			for ( const node of nodes ) {
				selections.push( makeRevealSelectionFromSymbol( editor, node ) );
			}

			editor.selections = selections;
			editor.revealRange( nodeToReveal.range, TextEditorRevealType.InCenterIfOutsideViewport );

			if ( symbolView?.visible && nodeToReveal ) {
				await symbolView.reveal( nodeToReveal, { expand: undefined, focus: false, select: true } );
			}
			await window.showTextDocument( editor.document );
			// if need the activeItem(s), see proposed: https://github.com/EhabY/vscode/blob/d23158246aaa474996f2237f735461ad47e41403/src/vscode-dts/vscode.proposed.treeViewActiveItem.d.ts#L10-L29
			// treeView.onDidChangeActiveItem()
			// waiting on https://github.com/microsoft/vscode/issues/185563
		} ),

		commands.registerCommand( 'symbolsTree.selectSymbol', async ( node: SymbolNode ) => {

			const editor = window.activeTextEditor;
			if ( !editor ) return;
			const treeSelection = symbolView?.visible ? symbolView.selection : [];
			const treeSingleSelection = treeSelection.length === 1 ? treeSelection[ 0 ] : undefined;

			const selectionMatchesSingleTreeNode = !!treeSingleSelection
				&& treeSingleSelection.uri.toString() === editor.document.uri.toString()
				&& ( () => {
					const treeNodeSelection = makeSelectionFromSymbol( editor, treeSingleSelection );
					return editor.selection.anchor.isEqual( treeNodeSelection.anchor )
						&& editor.selection.active.isEqual( treeNodeSelection.active );
				} )();

			const singleTreeNode = node || ( selectionMatchesSingleTreeNode ? treeSingleSelection : undefined );
			const shouldUseTreeSelection = !!node || treeSelection.length > 1 || !!singleTreeNode;

			if ( singleTreeNode && singleTreeNode.uri.toString() === editor.document.uri.toString() ) {
				const target = getNextSymbolTargetFromSymbol( editor, singleTreeNode );
				if ( target ) {
					editor.selection = target.selection;
					editor.revealRange( target.symbol.range, TextEditorRevealType.InCenterIfOutsideViewport );
					if ( symbolView?.visible ) {
						await symbolView.reveal( target.symbol, { expand: undefined, focus: false, select: true } );
					}
					await window.showTextDocument( editor.document );
					return;
				}
			}

			if ( !shouldUseTreeSelection ) {
				const target = await getNextSymbolTarget( editor );

				if ( !target ) {
					showSimpleMessage( "Found no symbol at the current cursor position." );
					return;
				}

				editor.selection = target.selection;
				editor.revealRange( target.symbol.range, TextEditorRevealType.InCenterIfOutsideViewport );
				await window.showTextDocument( editor.document );
				return;
			}

			// Multi-select TreeView behavior: do not continue editor-based parent cycling.
			resetSelectionCycle();

			let nodeToReveal: SymbolNode | undefined = undefined;
			if ( node ) nodeToReveal = node;
			else nodeToReveal = treeSelection[ 0 ];

			let selections: Selection[] = [];
			let nodes: SymbolNode[] = [];

			if ( node ) {
				if ( treeSelection.includes( node ) ) nodes.push( ...treeSelection );
				else nodes.push( node );
			}
			else nodes.push( ...treeSelection );

			for ( const node of nodes ) {
				const selection = makeSelectionFromSymbol( editor, node );
				selections.push( selection );
			}

			editor.selections = selections;
			const revealRange = new Range( nodeToReveal.range.start, nodeToReveal.range.end );
			editor.revealRange( revealRange, TextEditorRevealType.InCenterIfOutsideViewport );

			if ( symbolView?.visible && nodeToReveal ) {
				await symbolView.reveal( nodeToReveal, { expand: undefined, focus: false, select: true } );
			}
			await window.showTextDocument( editor.document );
		} ),
	);

	context.subscriptions.push( window.onDidChangeActiveTextEditor( async ( textEditor ) => {
		if ( textEditor ) {
			_Globals.updateIsJSTS( textEditor );
			if ( symbolView.visible && !SymbolsProvider.locked ) {
				await treeSymbolProvider.debouncedRefresh( '', TreeCache.UseFilterAndAllNodes );  // doesn't help if rapidly switch editors?
			}
		}
	} ) );
}

function removeEmptyStringsFromQuery ( query: string | string[] ): string | string[] | undefined {

	if ( typeof query === 'string' ) {
		if ( !query.length ) return undefined;
		else return query;
	}
	else if ( Array.isArray( query ) ) {
		return query.filter( q => q.length );
	}
}

export function deactivate () { }
