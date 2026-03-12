import { ExtensionContext, window, workspace, ConfigurationTarget, TextEditor } from 'vscode';

interface MySettings {
  useTypescriptCompiler: boolean;
  makeTreeView: boolean;
  collapseTreeViewItems: string;
}


export default class _Globals {

  private static readonly section = 'symbolsTree';

  // settings configs
  public static useTypescriptCompiler: boolean = false;
  public static makeTreeView: boolean = true;
  public static collapseTreeViewItems: string = "collapseOnOpen";

  // globals
  public static isJSTS: boolean = false;
  public static context: ExtensionContext;

  public constructor () { }

  // called once from activate() ---- await _Globals.init(context);
  public static async init ( context: ExtensionContext ): Promise<void> {

    const config = await workspace.getConfiguration( this.section );
    this.useTypescriptCompiler = config.get<boolean>( 'useTypescriptCompiler', false );
    this.makeTreeView = config.get<boolean>( 'makeTreeView', true );
    this.collapseTreeViewItems = config.get<string>( 'collapseTreeViewItems', "collapseOnOpen" );

    this.context = context;

    if ( window.activeTextEditor?.document.languageId.match( /javascript|typescript|javascriptreact|typescriptreact/ ) )
      this.isJSTS = true;
    else this.isJSTS = false;

    const disposable = workspace.onDidChangeConfiguration( e => {
      if ( e.affectsConfiguration( this.section ) ) {
        const config = workspace.getConfiguration( this.section );
        this.useTypescriptCompiler = config.get<boolean>( 'useTypescriptCompiler', this.useTypescriptCompiler );
        this.makeTreeView = config.get<boolean>( 'makeTreeView', this.makeTreeView );
        this.collapseTreeViewItems = config.get<string>( 'collapseTreeViewItems', this.collapseTreeViewItems );
      }
    } );
    if ( context ) context.subscriptions.push( disposable );
  }

  public static updateIsJSTS ( ev: TextEditor ) {
    if ( ev.document.languageId.match( /javascript|typescript|javascriptreact|typescriptreact/ ) )
      this.isJSTS = true;
    else this.isJSTS = false;
  }

  // ---- private generic accessors used only inside this class ----
  private static get<T> ( key: string, defaultValue?: T ): T | undefined {
    const config = workspace.getConfiguration( this.section );
    return config.get<T>( key, defaultValue as T );
  }

  private static set<T> ( key: string, value: T, isGlobal = true ): Thenable<void> {
    const config = workspace.getConfiguration( this.section );
    const target = isGlobal ? ConfigurationTarget.Global : ConfigurationTarget.Workspace;
    return config.update( key, value, target );
  }

  // ---- public typed helpers that keep cache in sync ----
  public static getSetting<K extends keyof MySettings> ( key: K ): MySettings[ K ] | undefined {
    // Prefer reading the cached public member when available
    switch ( key ) {
      case 'useTypescriptCompiler':
        return this.useTypescriptCompiler as MySettings[ K ];
      case 'makeTreeView':
        return this.makeTreeView as MySettings[ K ];

      default:
        return this.get<MySettings[ K ]>( String( key ) );
    }
  }

  public static setSetting<K extends keyof MySettings> ( key: K, value: MySettings[ K ], isGlobal = true ): void {
    this.set<MySettings[ K ]>( String( key ), value, isGlobal );
    switch ( key ) {
      case 'useTypescriptCompiler':
        this.useTypescriptCompiler = value as unknown as boolean;
        break;
      case 'makeTreeView':
        this.makeTreeView = value as unknown as boolean;
        break;

      default:
        break;
    }
  }

  // optional: inspect config source
  // public static inspect<K extends keyof MySettings>(key: K) {
  //   const cfg = vscode.workspace.getConfiguration(this.section);
  //   return cfg.inspect<MySettings[K]>(String(key));
  // }
}