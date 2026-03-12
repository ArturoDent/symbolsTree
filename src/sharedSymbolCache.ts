import * as vscode from 'vscode';
import { BoundedCache } from './mapCache';
import type { SymbolNode } from './types';

export type SymbolSource = 'vscode' | 'tsc';

export type SymbolCacheEntry = {
  documentVersion: number;
  source: SymbolSource;
  refreshSymbols: boolean;
  filterQuery: string | string[];
  allSymbols: SymbolNode[];
  filteredSymbols: SymbolNode[];
};

const JS_TS_LANG_RE = /^(javascript|typescript|javascriptreact|typescriptreact)$/;

let sharedCache: BoundedCache<vscode.Uri, SymbolCacheEntry> | undefined;
let sharedCacheRegistered = false;

export function getSymbolCache(): BoundedCache<vscode.Uri, SymbolCacheEntry> {
  if ( !sharedCache ) sharedCache = new BoundedCache<vscode.Uri, SymbolCacheEntry>( 3 );
  return sharedCache;
}

export function registerSymbolCache( context: vscode.ExtensionContext ): void {
  if ( sharedCacheRegistered ) return;
  context.subscriptions.push( getSymbolCache() );
  sharedCacheRegistered = true;
}

export function getSymbolSourceForDocument( document: vscode.TextDocument, useTypescriptCompiler: boolean ): SymbolSource {
  const isJSTS = JS_TS_LANG_RE.test( document.languageId );
  return ( isJSTS && useTypescriptCompiler ) ? 'tsc' : 'vscode';
}
