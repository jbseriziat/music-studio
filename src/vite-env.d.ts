/// <reference types="vite/client" />

// Déclaration des imports CSS Modules
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
