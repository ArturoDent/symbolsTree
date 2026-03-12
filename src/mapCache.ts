import * as vscode from 'vscode';


export class BoundedCache<K extends vscode.Uri, V> {

  private map = new Map<K, V>();

  constructor ( private readonly maxSize: number ) { }

  set ( key: K, value: V ): void {
    if ( this.map.has( key ) ) {
      this.map.delete( key );      // to set this item to last in Map = newest/last visited
    }

    this.map.set( key, value );

    if ( this.map.size > this.maxSize ) {
      const lruKey = this.map.keys().next().value;
      if ( lruKey !== undefined ) {
        this.map.delete( lruKey );
      }
    }
  }

  getLastVisitedUri (): K | undefined {
    const lastVisitedUri = Array.from( this.map.keys() ).pop();
    return lastVisitedUri;
  }

  get ( key: K ): V | undefined {
    if ( !this.map.has( key ) ) return undefined;

    const value = this.map.get( key )!;
    this.map.delete( key );      // to set this item to last in Map = newest/last visited
    this.map.set( key, value );
    return value;
  }


  has ( key: K ): boolean {
    return this.map.has( key );
  }

  delete ( key: K ): boolean {
    return this.map.delete( key );
  }

  clear (): void {
    this.map.clear();
  }

  // to clear values for ts/js files only
  clearJSTSValues (): void {
    const ending = /(ts|tsx|js|jsx)$/g;
    this.map.forEach( ( value: V, uri: K ) => {
      if ( uri.fsPath.match( ending ) )
        this.map.set( uri, null as unknown as V );
    } );
  }

  size (): number {
    return this.map.size;
  }

  keys (): IterableIterator<K> {
    return this.map.keys();
  }

  values (): IterableIterator<V> {
    return this.map.values();
  }

  entries (): IterableIterator<[ K, V ]> {
    return this.map.entries();
  }

  /**
   * Required for VS Code's subscription lifecycle.
   * Ensures the cache is cleaned up when the extension is disposed.
   */
  dispose (): void {
    this.clear();
  }

}