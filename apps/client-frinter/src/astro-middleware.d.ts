declare module 'astro:middleware' {
  export function defineMiddleware(
    handler: (context: any, next: () => Promise<Response>) => Response | Promise<Response>,
  ): (context: any, next: () => Promise<Response>) => Response | Promise<Response>;
}
