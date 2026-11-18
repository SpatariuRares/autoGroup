// Loader for Node: @material/material-color-utilities imports its own files without ".js", which Node
// does not resolve in ESM. If a relative import fails, it retries adding the extension.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && !specifier.endsWith('.js')) return next(`${specifier}.js`, context);
    throw err;
  }
}
