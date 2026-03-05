import {
  DocumentSymbol, workspace, window, Uri, TextDocument, commands, ThemeIcon, QuickPick, QuickInputButton,
  QuickPickItemButtonEvent, Position, Range, Selection, TextEditorRevealType, ExtensionContext
} from 'vscode';
import * as Globals from './myGlobals';

import * as arrowFunctions from './arrowFunctions';
import { filterDepthMap, unfilteredDepthMap } from './depthMap';
import { traverseSymbols } from './qpTraverse';
import { BoundedCache } from './mapCache';

import type { SymMap, SymbolPickItem, SymbolMap, NodePickItems, ReturnSymbols } from './types';
import { mapKindToNameAndIconPath } from './symbolKindMap';
import { collectSymbolItemsFromSource } from './nodeList';
import { filterDocNodes } from './nodeFilter';
import { showQuickPickMessage } from './messages';
import { isMap } from 'util/types';

// Define a type for the BoundedCache value, key is a Uri
// TODO: add program and sourceFile ?
type QuickPickCache = {
  refreshSymbols: boolean;
  allSymbols: NodePickItems | SymbolMap;
  filteredSymbols: NodePickItems | SymbolMap;
  allQPItems?: SymbolPickItem[];
  filteredQPItems?: SymbolPickItem[];
};


export class SymbolPicker {

  // local "globals"
  private kbSymbolsSaved: ( keyof SymMap )[] = [];
  private filterState: string = 'filtered';

  private docSymbols: DocumentSymbol[] = [];
  private arrowFunctionSymbols: DocumentSymbol[] = [];

  private symbolDepthMap: SymbolMap = new Map();
  private filteredDepthMap: SymbolMap = new Map();
  private allDepthMap: SymbolMap = new Map();

  private allDocNodes: NodePickItems = [];
  private filteredDocNodes: NodePickItems = [];

  // Create a bounded cache of Map <Uri → QuickPickCache> with max size 3 editors
  private cache = new BoundedCache<Uri, QuickPickCache>( 3 );

  public qp: QuickPick<SymbolPickItem>;
  private filterButton: QuickInputButton;
  private refreshButton: QuickInputButton;

  private selectButton: QuickInputButton;
  public tracker;


  constructor( context: ExtensionContext ) {

    this.qp = window.createQuickPick<SymbolPickItem>();
    this.qp.ignoreFocusOut = true;
    this.qp.title = 'Select Symbols';
    ( this.qp as any ).sortByLabel = false;  // stop alphabetical resorting, especially in onDidChangeValue() below
    this.tracker = trackQuickPickVisibility( this.qp );

    this.filterButton = {
      iconPath: new ThemeIcon( 'filter' ),
      tooltip: 'Toggle Filter'
    };

    this.refreshButton = {
      iconPath: new ThemeIcon( 'refresh' ),
      tooltip: 'Refresh'
    };

    this.selectButton = {
      iconPath: new ThemeIcon( 'selection' ),
      tooltip: 'Select Symbol'
    };

    if ( !this.qp.buttons.length ) this.qp.buttons = [this.filterButton, this.refreshButton];


    context.subscriptions.push( workspace.onDidChangeConfiguration( e => {
      if ( e.affectsConfiguration( "symbolsTree.useTypescriptCompiler" ) ) {
        // if useTypescriptCompiler changed, cache needs to be nullified
        this.cache.clearJSTSValues();
      }
    } ) );

    // if current document was edited
    context.subscriptions.push( workspace.onDidChangeTextDocument( async ( event ) => {
      if ( event.contentChanges.length ) {
        this.cache.set( event.document.uri, { refreshSymbols: true, allSymbols: [], filteredSymbols: [] } );
      }
    } ) );


    // clicking on the selection icon on hover on a line item, since there is only one button,
    // the selectButton, no need to check that event.button === this.selectButton
    context.subscriptions.push( this.qp.onDidTriggerItemButton( ( event: QuickPickItemButtonEvent<SymbolPickItem> ) => {
      const editor = window.activeTextEditor;
      const document = editor?.document;
      if ( !document ) return;

      const target = event.item;
      const lastLineLength = document.lineAt( target.range.end ).text.length;
      const extendedRange = target.range.with( {
        start: new Position( target.range.start.line, 0 ),
        end: new Position( target.range.end.line, lastLineLength )
      } );

      editor.selections = [new Selection( extendedRange.end, extendedRange.start )];
      editor.revealRange( new Range( editor.selections[0].anchor, editor.selections[0].active ), TextEditorRevealType.Default );
      this.qp.hide();
    } ) );

    // select an item in the QP list (not clicking on the selection icon)
    context.subscriptions.push( this.qp.onDidChangeSelection( selectedItems => {
      const editor = window.activeTextEditor;
      const document = editor?.document;
      if ( !document ) return;

      const target = selectedItems[0].selectionRange;
      editor.selections = [new Selection( target.start, target.start )];
      editor.revealRange( new Range( editor.selections[0].active, editor.selections[0].active ), TextEditorRevealType.InCenter );
      this.qp.hide();
    } ) );

    // filterButton and refreshButton
    // make the filtered version first and save it, then, if called, make the All version and save it
    context.subscriptions.push( this.qp.onDidTriggerButton( async button => {
      const document = window.activeTextEditor?.document;
      if ( !document ) return;
      const _Globals = Globals.default;

      if ( button === this.filterButton ) {
        const cache = this.cache.get( document.uri );

        if ( cache && !cache.refreshSymbols ) {
          if ( this.filterState === 'filtered' ) {        // going to unfiltered state
            if ( cache.allQPItems?.length )
              this.qp.items = cache.allQPItems;         // assert non-null not needed
            else {
              showQuickPickMessage( "There are no document symbols remaining AFTER applying your 'symbols' from the keybinding." );
              this.qp.hide();
            }
            this.filterState = 'not filtered';
          }
          else {                                      // going back to filtered state
            if ( cache.filteredQPItems?.length )
              this.qp.items = cache.filteredQPItems;   // assert non-null not needed because of length check
            else {
              showQuickPickMessage( "There are no document symbols remaining AFTER applying your 'symbols' from the keybinding." );
              this.qp.hide();
            }
            this.filterState = 'filtered';
          }
        }
        else {   // start anew, file changed
          let newSymbols: ReturnSymbols | undefined;

          if ( this.filterState === 'unfiltered' ) {  // going to filtered state
            if ( _Globals.isJSTS && _Globals.useTypescriptCompiler )
              newSymbols = await this.getNodes( this.kbSymbolsSaved, document );
            else
              newSymbols = await this.getSymbols( this.kbSymbolsSaved, document );

            if ( newSymbols ) await this.render( newSymbols, true );
            else {
              showQuickPickMessage( "There are no document symbols remaining AFTER applying your 'symbols' from the keybinding." );
              this.qp.hide();
            }
          }

          else {   // go to unfiltered state
            if ( _Globals.isJSTS && _Globals.useTypescriptCompiler )
              newSymbols = await this.getNodes( this.kbSymbolsSaved, document );
            else
              newSymbols = await this.getSymbols( this.kbSymbolsSaved, document );

            if ( newSymbols ) await this.render( newSymbols, false );
            else {
              showQuickPickMessage( "There are no document symbols remaining AFTER applying your 'symbols' from the keybinding." );
              this.qp.hide();
            }
          }
        }
      }  // end of if (filterButton)

      else if ( button === this.refreshButton ) {
        this.qp.value = '';
        await commands.executeCommand( 'symbolsTree.refreshQuickPick' );
      }

    } ) );  // end of onDidTriggerButton()
  }  // end of constructor()


  // Get the Nodes using tsc, and return filtered nodes
  async getNodes( kbSymbols: ( keyof SymMap )[], document: TextDocument ): Promise<ReturnSymbols | undefined> {

    this.kbSymbolsSaved = kbSymbols;
    let thisUriCache: QuickPickCache | undefined;

    if ( this.cache.get( document.uri ) )
      thisUriCache = this.cache.get( document.uri );

    if ( !thisUriCache || thisUriCache.refreshSymbols ) {

      this.allDocNodes = await collectSymbolItemsFromSource( document );
      this.symbolDepthMap.clear();
      this.filteredDepthMap.clear();
      this.allDepthMap.clear();
      this.filteredDocNodes = [];
      this.docSymbols = [];
    }
    else {
      this.allDocNodes = thisUriCache.allSymbols as NodePickItems;
    }

    if ( this.allDocNodes.length ) {
      this.filteredDocNodes = await filterDocNodes( kbSymbols, this.allDocNodes );
      this.cache.set( document.uri, { refreshSymbols: false, allSymbols: this.allDocNodes, filteredSymbols: this.filteredDocNodes } );

      if ( !this.filteredDocNodes.length )
        showQuickPickMessage( "QuickPick: There are no document symbols remaining AFTER applying your 'symbols' from the keybinding." );
    }
    else {
      showQuickPickMessage( "QuickPick: Found no document symbols in this editor." );
    }

    return {
      allSymbols: this.allDocNodes,
      filteredSymbols: this.filteredDocNodes
    };
  }

  /**
 * 1. Get doc symbols from vscode.executeDocumentSymbolProvider.
 * 2. Build an array of symbols for arrow functions (else identified as variables).
 * 3. Build a depth map of all symbols.
 * 4. Filter the depth map by keybinding symbols.
  */
  async getSymbols( kbSymbols: ( keyof SymMap )[], document: TextDocument ): Promise<ReturnSymbols | undefined> {

    this.kbSymbolsSaved = kbSymbols;
    const _Globals = Globals.default;

    // Map.get() can return undefined if key not found
    const thisUriCache: QuickPickCache | undefined = this.cache.get( document.uri );

    if ( thisUriCache ) {
      if ( isMap( thisUriCache.allSymbols ) && thisUriCache.allSymbols.size && !thisUriCache.refreshSymbols ) {
        return {
          allSymbols: thisUriCache.allSymbols,
          filteredSymbols: thisUriCache.filteredSymbols
        };
      }
      else if ( !isMap( thisUriCache.allSymbols ) && thisUriCache.allSymbols.length && !thisUriCache.refreshSymbols ) {
        return {
          allSymbols: thisUriCache.allSymbols,
          filteredSymbols: thisUriCache.filteredSymbols
        };
      }
    }

    else {
      this.docSymbols = await commands.executeCommand( 'vscode.executeDocumentSymbolProvider', document.uri );
      this.symbolDepthMap.clear();
      this.filteredDepthMap.clear();
      this.allDepthMap.clear();
      this.allDocNodes = [];
      this.filteredDocNodes = [];

      this.arrowFunctionSymbols = _Globals.isJSTS
        ? await arrowFunctions.makeSymbolsFromFunctionExpressions( document ) || []
        : [];

      if ( this.docSymbols ) {
        this.symbolDepthMap = traverseSymbols( this.docSymbols, document );
      }
      else
        showQuickPickMessage( "QuickPick: Found no document symbols in this editor." );
    }

    if ( this.symbolDepthMap.size ) {

      // this is the filtering step and also merges the arrowFunctions
      this.filteredDepthMap = await filterDepthMap( this.arrowFunctionSymbols, this.symbolDepthMap, this.kbSymbolsSaved );

      if ( !this.filteredDepthMap.size ) {
        showQuickPickMessage( "There are no document symbols remaining AFTER applying your 'symbols' from the keybinding." );
        return undefined;
      }

      // merges the arrowFunctions but doesn't filter
      // this.symbolDepthMap doesn't have the arrowFunctions merged yet
      this.allDepthMap = await unfilteredDepthMap( this.arrowFunctionSymbols, this.symbolDepthMap );

      this.cache.set( document.uri, { refreshSymbols: false, allSymbols: this.allDepthMap, filteredSymbols: this.filteredDepthMap } );

      return {
        allSymbols: this.allDepthMap,
        filteredSymbols: this.filteredDepthMap
      };

    } else {
      showQuickPickMessage( "There are no document symbols remaining AFTER applying your 'symbols' from the keybinding." );
      return undefined;
    }
  }

  /**
   * Show a QuickPick of the document symbols in options 'symbols'
  */
  async render( symbols: ReturnSymbols, renderFilteredSymbols: boolean ) {
    const document = window.activeTextEditor?.document;
    if ( !document ) return;

    const filteredQPItems = await this.makeQPItems( symbols.filteredSymbols, [this.selectButton] );
    const allQPItems = await this.makeQPItems( symbols.allSymbols, [this.selectButton] );

    if ( renderFilteredSymbols ) {
      this.qp.items = filteredQPItems;
      this.filterState = 'filtered';
    }
    else {
      this.qp.items = allQPItems;
      this.filterState = 'unfiltered';
    }

    this.cache.set( document.uri, { refreshSymbols: false, allSymbols: this.allDocNodes, filteredSymbols: this.filteredDocNodes, allQPItems, filteredQPItems } );
    this.qp.show();
    // console.log();

    // this.qp.onDidHide(() => this.qp.dispose());
  }


  async makeQPItems( items: NodePickItems | SymbolMap, buttons: QuickInputButton[] ): Promise<SymbolPickItem[]> {

    const qpItems: SymbolPickItem[] = [];

    if ( isMap( items ) ) {    // for SymbolMap, non-tsc

      items.forEach( ( depth, symbol ) => {
        let label = ( parseInt( symbol.name ) >= 0 ) ? symbol.detail : `${symbol.name}: ${symbol.detail}`;
        if ( depth ) label = ( '└─  ' + label ).padStart( label.length + ( depth * 10 ), ' ' );

        // do a reverse mapping from symbol.kind -> "class", "function", etc.
        // description: ` (${mapKindToNameAndIconPath.get(symbol.kind)?.name})`, // var => arrow fn
        qpItems.push( {
          label: label + ` --- (${mapKindToNameAndIconPath.get( symbol?.kind )?.name})`,
          range: symbol.range,
          selectionRange: symbol.selectionRange,
          buttons
        } );
      } );
    }

    else {  // for NodePickItems, using tsc

      items.forEach( item => {
        let label = item.label;
        if ( item.depth > 0 ) label = ( '└─  ' + label ).padStart( item.label!.length + ( item.depth * 10 ), ' ' );

        qpItems.push( {
          label: `${label}   ---  (${item.detail})`,
          range: item.range,
          selectionRange: item.selectionRange,
          buttons
        } );
      } );
    }

    return qpItems;
  }

  dispose() {
    // this.context.subscriptions.forEach(sub => sub.dispose());
    // this.qp.dispose();
    // this.dispose();
  };

}

// Usage: this.tracker.visible
export function trackQuickPickVisibility( qp: QuickPick<any> ) {
  let visible = false;

  // TODO: setContext in these fo ruse in keybindings
  // Wrap show() to mark visible when called
  const originalShow = qp.show.bind( qp );
  qp.show = () => {
    visible = true;
    originalShow();
    commands.executeCommand( 'setContext', 'symbolsTree.quickPickVisible', true );
  };

  // Reset when hidden
  qp.onDidHide( () => {
    visible = false;
    commands.executeCommand( 'setContext', 'symbolsTree.quickPickVisible', false );
  } );

  // Expose a property-style getter
  return {
    get visible() {
      return visible;
    }
  };
}