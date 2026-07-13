// Locale fijo: sin él, runtimes en locale 'es' pintan 4 dígitos sin separador
// (3750) y 5 con punto (13.750) en la misma pantalla.
export const formatPts = (n: number) => n.toLocaleString('es-MX')
