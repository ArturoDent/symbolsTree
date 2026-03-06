# Symbols Tree (also called Symbol Jump and Select )

Show a **QuickPick** with all or just filtered symbols.  Items can be filtered by keybinding or by searching within the QuickPick.

You can also show a **TreeView** in the SideBar or Secondary SideBar that allows jumping and selecting and filtering.

Click on an item to go to that symbol **OR** to go to and select that entire symbol and its children - in the TreeView or the QuickPick

## Symbols TreeView

Initially the Symbols Tree  icon (
<img src="./icons/list-tree.jpg" width="16" height="16" alt="Symbols Tree icon"/>) will appear in the Activity Bar and clicking on it will open the view in the Primary SideBar, but it can be dragged or moved to the Secondary SideBar or the Panel (where the Terminal usually lives).

Here is what the top of the Symbols TreeView looks like:

<img src="https://github.com/ArturoDent/symbolsTree/blob/main/images/TreeViewIcons.png?raw=true" width="350" height="100" alt="The top portion of a Symbols TreeView in the Side Bar"/>

Notice the icons across the top:  

<img src="./icons/lock.jpg" width="16" height="16" alt="Symbols TreeView lock icon"/> <img src="./icons/filter.jpg" width="16" height="16" alt="Symbols Tree filter icon"/> <img src="./icons/refresh.jpg" width="16" height="16" alt="Symbols Tree refresh icon"/> <img src="./icons/square-minus.jpg" width="16" height="16" alt="Symbols Tree collapseAll icon"/>

##### <img src="./icons/lock.jpg" width="16" height="16" alt="Symbols TreeView lock icon"/> : `lock` - prevent the TreeView from updating to the new file when you switch editors.  Press <img src="./icons/unlock.jpg" width="16" height="16" alt="Symbols TreeView unlock icon"/> to unlock.

##### <img src="./icons/filter.jpg" width="16" height="16" alt="Symbols Tree filter icon"/> : `filter` -  open an input box for search/filter terms to narrow the TreeView.

##### <img src="./icons/refresh.jpg" width="16" height="16" alt="Symbols Tree refresh icon"/> : `refresh` - return the TreeView to the full unfiltered view.

##### <img src="./icons/square-minus.jpg" width="16" height="16" alt="Symbols Tree collapseAll icon"/> : `collapse all` nodes in the TreeView. Press <img src="./icons/square-plus.jpg" width="16" height="16" alt="Symbols TreeView expandAll icon"/> to expand all.

* Note: refresh <img src="./icons/refresh.jpg" width="16" height="16" alt="Symbols Tree refresh icon"/> will return to the unfiltered state ***AND*** expand all nodes (if the setting `Symbols Tree: Collapse Tree View Items` is set to `expandOnOpen`) ***or*** collapse all nodes (if the same setting is set to `collapseOnOpen`).  Refresh will also `unlock` any existing locked TreeView.  

----------

Here are examples of keybindings:

```jsonc
// open a QuickPick showing only these Document Symbols
{
  "key": "alt+o",       // whatever keybinding you want
  "command": "symbolsTree.showQuickPick",
  "args": {
    "symbols": [      // only use document symbols here
      "class",
      "method",
      "function",
    ]
  }
},

// show or filter only class symbols in the TreeView
{
  "key": "alt+f",       // whatever keybinding you want
  "command": "symbolsTree.applyFilter",
  "args": [   // must have an "args" option
    "class"   // you can use document symbols or any other text !
  ],
  "when": "view.symbolsTree.visible"
},
```

#### Open an unfiltered QuickPick and filter by text input:

<img src="https://github.com/ArturoDent/symbolsTree/blob/main/images/qpFilterRefresh1.gif?raw=true" width="750" height="500" alt="Show selections in QuickPick"/>

-----------

#### Open a  QuickPick already filtered by 'class':

<img src="https://github.com/ArturoDent/symbolsTree/blob/main/images/qpfilterKeybinding1.gif?raw=true" width="750" height="500" alt="Show filter toggle in QuickPick"/>

* Important: You will have to <kbd>Esc</kbd> to hide the QuickPick, clicking outside it will not hide it.

You can filter by any combination of the following symbols (any other text will be ignored by this command but you can always filter the resulting QuickPick by its text input box):

## `symbols` Options

* string or array, optional, default = all symbols below

Here are the values that can be used in the `symbols` option in a keybinding:

<table style="border-collapse:collapse;border:1px solid #000;width:auto;">
  <thead>
    <tr>
      <th colspan="7" style="text-align:center;background:#f7f7f7;border-bottom:1px solid #333;">
        symbols
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:6px 20px;">class</td>
      <td style="padding:6px 20px;">method</td>
      <td style="padding:6px 20px;">function</td>
      <td style="padding:6px 20px;">property</td>
      <td style="padding:6px 20px;">file</td>
      <td style="padding:6px 20px;">module</td>
      <td style="padding:6px 20px;">event</td>
    </tr>
    <tr>
      <td style="padding:6px 20px;">operator</td>
      <td style="padding:6px 20px;">namespace</td>
      <td style="padding:6px 20px;">package</td>
      <td style="padding:6px 20px;">struct</td>
      <td style="padding:6px 20px;">typeParameter</td>
      <td style="padding:6px 20px;">variable</td>
      <td style="padding:6px 20px;">field</td>
    </tr>
    <tr>
      <td style="padding:6px 20px;">constant</td>
      <td style="padding:6px 20px;">null</td>
      <td style="padding:6px 20px;">enum</td>
      <td style="padding:6px 20px;">enumMember</td>
      <td style="padding:6px 20px;">interface</td>
      <td style="padding:6px 20px;">constructor</td>
      <td style="padding:6px 20px;">string</td>
    </tr>
    <tr>
      <td style="padding:6px 20px;">number</td>
      <td style="padding:6px 20px;">boolean</td>
      <td style="padding:6px 20px;">array</td>
      <td style="padding:6px 20px;">object</td>
      <td style="padding:6px 20px;">key</td>
      <td style="padding:6px 20px;"></td>
      <td style="padding:6px 20px;"></td>
    </tr>
  </tbody>
</table>

<br/>

<table style="border-collapse:collapse;border:1px solid #000;overflow:hidden;width:auto;">
  <thead>
    <tr>
      <th colspan="7" style="text-align:center;background:#f7f7f7;border-bottom:1px solid #333;">
        additional symbols if using the typescript compiler option
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:6px 20px;">call</td>
      <td style="padding:6px 20px;">return</td>
      <td style="padding:6px 20px;">arrow</td>
      <td style="padding:6px 20px;">anonymous</td>
      <td style="padding:6px 20px;">declaration</td>
      <td style="padding:6px 20px;">switch</td>
      <td style="padding:6px 20px;">case</td>
    </tr>
  </tbody>
</table>

<br/>

`call/return/arrow/anonymous/declaration` refer to function or method calls, returns, etc.

`call/return/arrow/anonymous/declaration/switch/case` are only available if you are using the typescript compiler (`tsc`).

If you omit the `symbols` option in your keybinding (or it is just an empty array), or if you invoke the command `symbolsTree.showQuickPick` from the Command Palette, the default is **all** of the symbols listed above.  For any particular language or file type, many of the symbols may not be used.  

------------  

### QuickPick

* `symbolsTree.showQuickPick`

```plaintext
// in the Command Palette:
Symbol Jump/Select: Open a quickpick of filtered symbols.
```

In the title bar of the QuickPick there is a **filter** icon ( <img src="./icons/filter.jpg" width="16" height="16" alt="filter icon"/> ) on the top right.  Toggling that icon will negate any filtering of the symbols (from your keybinding) and ALL symbols in the file will be shown.  Toggling again will re-filter by your `symbols` in the keybinding, if any.

There is also a **refresh** icon ( <img src="./icons/refresh.jpg" width="16" height="16" alt="refresh icon"/> ) on the top right.  Clicking that icon will remove any filter from the QuickPick, including text in the Input area, to show all symbols in the document.

* Use the **refresh** icon ( <img src="./icons/refresh.jpg" width="16" height="16" alt="refresh icon"/> ) when the QuickPick is open and you have made changes to the editor's contents.  The QuickPick will be updated (as well as any filters removed to show all symbols).

Each symbol that is shown will have a **selection** icon ( <img src="./icons/selection.jpg" width="16" height="16" alt="selection icon"/> ) on the right when that line is highlighted or hovered.  Clicking that selection icon will make the cursor jump to that symbol and select it.  The entire symbol (and its children, if any) will be selected.  

Children are shown indented by └─'s to their proper depth.

* If you filter for some symbol in your keybinding, like 'constructor', and that symbol occurs within another symbolKind, like 'class', the parent symbol(s) (the 'class', for example) will be shown for context.

The QuickPick can also be filtered by the symbolKind (class, method, function,etc.) in the Input Box at the top.  This will filter by the symbols' names and symbolKinds.  So if you opened a quickPick of all symbols, you could then type 'class' to see only classes in the file listed or type 'function' or 'constructor', etc. to see only those symbolKind of symbols in the file.  

If you have already filtered by symbols in the keybinding, you can only search in the QuickPick for those shown symbol names and Kinds. But you could toggle the <img src="./icons/filter.jpg" width="16" height="16" alt="filter icon"/> button at the top right and then search in the QuickPick input field through all symbols in the file.  

* `symbolsTree.refreshQuickPick`

```plaintext
// in the Command Palette:
Symbol Jump/Select: Refresh to show all symbols
```

### Symbols Tree: a TreeView

The following commands are triggered by clicking on the icons at the top of the TreeView. In addition, they can be triggered from a keybinding (if the `when` clauses apply, see the default keybindings below).

* **symbolsTree.lock** : <img src="./icons/lock.jpg" width="16" height="16" alt="lock icon"/>  
 In the Command Palette: ``` Symbols Tree: Lock ```

This is a toggle between lock and unlock - there will only be a single icon at a time that appears at the top of the tree to toggle the lock status.

* **symbolsTree.unlock** : <img src="./icons/unlock.jpg" width="16" height="16" alt="unlock icon"/>  
 In the Command Palette: ``` Symbols Tree: Unlock ```

 -----------------

* **symbolsTree.getFilter** : <img src="./icons/filter.jpg" width="16" height="16" alt="filter icon"/>  
 In the Command Palette: ``` Symbols Tree: Get Filter ```

 This command opens an input box for a query/filter to apply to the TreeView items.  It is the same as clicking on the filter icon.

You can enter any text such as symbol names, like `class`, evn though that may not appear in the TreeView symbols.  Information for the symbol types is saved and searchable although not visible.  You can also search/filter by any text that you see such as function or class names, etc.  

You can also input multiple terms which will be handles like an `or` statement.  So you use "myFunction || class" to find both of those.  You can also use "myFunction, someOtherName" to get both of those.  You can chain as many terms as you like in the input box.  

 -----------------

 Spaces within your filter query (in the QuickPick input box) are respected, they are NOT removed.

* **symbolsTree.refreshTree**  : <img src="./icons/refresh.jpg" width="16" height="16" alt="refresh icon"/>  
 In the Command Palette: ``` Symbols Tree: Refresh Tree View```

 -----------------

* **symbolsTree.collapseAll** : <img src="./icons/square-minus.jpg" width="16" height="16" alt="collapseAll icon"/>  
 In the Command Palette: ``` Symbols Tree: Collapse All ```

This is a toggle between collapse all  and expand all - there will only be a single icon at a time that appears at the top of the tree to toggle the collapsed status.

 -----------------

* **symbolsTree.expandAll** : <img src="./icons/square-plus.jpg" width="16" height="16" alt="expandAll icon"/>  
 In the Command Palette: ``` Symbols Tree: Expand All ```

-----------------

* **symbolsTree.selectSymbol**  
 In the Command Palette: ``` Symbols Tree: Select symbol(s)  ```

This command is triggered in one of three ways:  

1.  by clicking on the **selection** icon ( <img src="./icons/selection.jpg" width="16" height="16" alt="selection icon"/> ) found on each line of the TreeView when hovering over an entry;
2.  by clickig on the **selection** icon on each line of the QuickPick you opened; or  
3.  by triggering the command ffrom the Command Palette or a keybinding such as  

```jsonc
{
  "key": "alt+e",
  "command": "symbolsTree.selectSymbol"
}
  ```
  
When you have symbols which have parent symbols you can quickly select up yhe parent tree by repeatedly triggering the keybinding as the following demo shows:  

<img src="https://github.com/ArturoDent/symbolsTree/blob/main/images/parentSelection.gif?raw=true" width="750" height="500" alt="Progressively select parent symbols"/>

Parent selection also works when starting in the TreeView.  First click on the selection icon (or trigger the `synbolsTree.selectSymbol` command when a TreeItem is focussed) for a symbol, and then you can progressively select parents with the same keybinding as above.  Notice in the TreeView that the parent symbols are shown highlighted/selected with each keybinding trigger and that they are selected in the editor too:  

<img src="https://github.com/ArturoDent/symbolsTree/blob/main/images/parentSelectionInTreeView.gif?raw=true" width="950" height="500" alt="Progressively select parent symbols in a TreeView"/>

 As the following demo shows you can also select more than one entry and then click the selection icon to go to and select all those symbols - with multiple cursors being created.  In the demo I use <kbd>Alt</kbd>+<kbd>click</kbd> to select multiple symbols in the TreeView list.  You can also use <kbd>Shift</kbd>+<kbd>click</kbd> to select a range of symbols - each symbol will be selected with its own cursor.  

<img src="https://github.com/ArturoDent/symbolsTree/blob/main/images/TreeViewMultipleSelections1.gif?raw=true" width="950" height="500" alt="Multiple selections in the TreeView"/>

---------------

* **symbolsTree.applyFilter**  
 In the Command Palette: ``` Symbols Tree: Apply a filter from a keybinding  ```
  
 This command can **ONLY** be triggered via a keybinding:

```jsonc
{
  "key": "alt+a",              // whatever you want
  "command": "symbolsTree.applyFilter",
  "args": [
    "class",
    // etc.     // function names, etc. Anything that may appear in the TreeView
  ],
  "when": "symbolsTree.visible"
}
```

## Default Keybindings

* Important: Note the custom `when` clauses that are available below.  

These are the default keybindings that are set by the extension, but they can be changed by you:

```jsonc
{
  "key": "alt+f",                           // you can change these in vscode
  "command": "symbolsTree.refreshQuickPick",
  "when": "symbolsTree.quickPickVisible"    // if the QuickPick is visible
},
{
  "key": "alt+f",
  "command": "symbolsTree.showQuickPick",
  "when": "!symbolsTree.quickPickVisible"   // when the QuickPick is not visible
},
{
  "key": "alt+f",
  "command": "symbolsTree.applyFilter",
  "when": "symbolsTree.visible"
},
{
  "key": "alt+l",
  "command": "symbolsTree.lock",
  "when": "symbolsTree.visible && !symbolsTree.locked"
},
{
  "key": "alt+l",
  "command": "symbolsTree.unlock",
  "when": "symbolsTree.visible && symbolsTree.locked"
},
{
  "key": "alt+r",
  "command": "symbolsTree.refreshTree",
  "when": "symbolsTree.visible"
},
{
  "key": "alt+g",
  "command": "symbolsTree.getFilter",
  "when": "symbolsTree.visible"
},
{
  "key": "alt+c",
  "command": "symbolsTree.collapseAll",
  "when": "symbolsTree.visible && !symbolsTree.collapsed"
},
{
  "key": "alt+c",
  "command": "symbolsTree.expandAll",
  "when": "symbolsTree.visible && symbolsTree.collapsed"
},
{
  "key": "alt+t",
  "command": "symbolsTree.revealSymbol",
  "when": "symbolsTree.visible && symbolsTree.hasSelection"
},
{
  "key": "alt+s",
  "command": "symbolsTree.selectSymbol",
  "when": "symbolsTree.visible && symbolsTree.hasSelection"
}
```

## Extension Settings

This extension contributes these settings:

* `symbolsTree.useTypescriptCompiler`  default = **true**

```plaintext
// in your Settings UI search for 'Typescript Compiler' or 'Symbols Tree':
Symbols Tree: Use Typescript Compiler.
"Whether to use the more resource-intensive typescript compiler (`tsc`) to produce more detailed symbol entries."
```

In your settings.json, look for this:  ``` "symbolsTree.useTypescriptCompiler": false```

The typescript compiler is only available for javascript, javascriptreact, typescript and typescriptreact files.  It will be more resource-intensive than the built-in symbol provider so you can turn it off.  But with it enabled, you get more detailed and informative entries.

* `symbolsTree.makeTreeView`  default = **true**

```plaintext
// in your Settings UI search for 'tree view' or 'symbols tree':
Symbols Tree: Make Tree View.
"Make a TreeView that can be shown in the SideBar, etc."
```

In your settings.json, look for this:  ```"symbolsTree.makeTreeView": false```

* `symbolsTree.collapseTreeViewItems`  default = **collapseOnOpen**

```plaintext
// in your Settings UI search for 'tree view' or 'symbols tree':
Symbols Tree: Collapse Tree View Items.
"Expand/Collapse all items on when opening or refreshing the TreeView."
```

In your settings.json, look for this:  ```"symbolsTree.makeTreeView": "expandOnOpen"  // or "collapseOnOpen"```

Hitting the refresh button on the TreeView will expand or collapse all tree items according to this setting.  So you could hit the `CollapseAll` button and then `Refresh` to re-expand the tree (if `expandOnOpen`).

## Benefits of Using the Typescript Compiler (tsc)

1. `function calls` with arguments, including anonymous and arrow functions,
2. `returns` with what is actually returned,
3. `variables` with what they are initialized to,
4. `function declarations` have their parameters,
5. `class methods` have their arguments and returns,
6. `case/switch` statements are shown with their identifiers,
7. in `json` files, arrays have their string entries rather than just '0', '1', '2', etc.
8. etc.

There will be some "context" shown after the node/symbol in the quickPick that can be used for filtering by the input box at the top, like `function declaration`, `return`, `constructor`, `case` or `switch` and more.  That same "context" is in the TreeView items but not visible but still can be used to filter the tree.  

## Arrow Functions and Function Names

Normally, in a javascript/typescript file these kinds of symbols would only be identified as `variables` and that is not very helpful:

```javascript
const someFunc = function (a) {...}   // this is a 'variable' symbol, NOT a 'function' symbol

const square = x => x * x;            // this is a 'variable' symbol, NOT a 'function' symbol
```

So this extension will determine if those 'variables' are in fact 'functions' and will identify them as such in the QuickPick.  Filtering for `function` in a keybinding will show these functions (despite the javascript language server identifying then solely as 'variables').  

## Known Issues

1. Switching rapidly between editors may result in the TreeView getting out of sync and not showing the correct TreeVew.  Cancelling the TreeView debounced refresh doesn't work. Refreshing the TreeView with the <img src="./icons/refresh.jpg" width="16" height="16" alt="Symbols Tree refresh icon"/> should fix that.  
2. Starting vscode (or re-loading it) with a .json file as the current editor may result in only some of the json file's symbols being shown in the TreeView (it only seems to happen to me with launch.json and not other json files).  

## TODO

* Work on more parents nodes shown on filtering: e.g., show function declaration on switch/case or show the switch on filter by `case`, show class on `constructor`.
* Consider making `ignoreFocusOut` an optional setting.
* `centerOnCursor` on opening? Search by symbol/node range.
* Keep an eye on [TreeView.activeItem](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.treeViewActiveItem.d.ts).
* Follow focus of editor cursor? Center enclosing symbol?
* Keep an eye on tsgo, [ts native preview](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview&ssr=false#overview).
* Keep an eye on [TreeItem markdown labels](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.treeItemMarkdownLabel.d.ts).
* Implement successive searches (using previous results)?
* Clickable parameters?

## Release Notes

* 0.2.0&emsp;First Release.

* 0.5.0&emsp;Switched to esBuild.
