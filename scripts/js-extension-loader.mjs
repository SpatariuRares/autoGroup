// Loader per Node: @material/material-color-utilities importa i propri file senza ".js", che Node
// in ESM non risolve. Se un import relativo fallisce, riprova aggiungendo l'estensione.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && !specifier.endsWith('.js')) return next(`${specifier}.js`, context);
    throw err;
  }
}
