/**
 * Files whose change a running dev server does not pick up reliably. Astro, for one,
 * stops reloading content after src/content.config.ts changes underneath it.
 */
export const RESTART_FILES = /^(astro\.config\.[cm]?[jt]s|src\/content\.config\.[cm]?[jt]s|src\/content\/config\.[cm]?[jt]s|kern\.config\.yaml|package\.json|pnpm-lock\.yaml)$/;
