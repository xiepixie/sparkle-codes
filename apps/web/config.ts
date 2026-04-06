/**
 * Application Configuration
 * 
 * Central destination for all environment variables and global constants.
 * Following the decoupled architecture: Documentation is a separate app.
 */
export const config = {
  // the name of the app
  appName: "sparkle.codes",
  
  // Site Metadata
  siteName: "sparkle.codes",
  siteDescription:
    "The personal blog and product lab of Xavier Pax (xpx), focused on applied AI, workflow systems, and technical writing.",

  // the link to the documentation app (if not defined, the documentation link will not be shown in the app)
  docsLink: (process.env.NEXT_PUBLIC_DOCS_URL || "/docs") as string,

  // the themes that should be available in the app
  enabledThemes: ["light", "dark"],
  // the default theme
  defaultTheme: "light",

  // Social Links
  github: "https://github.com/yourusername/sparkle-codes",
  twitter: "https://twitter.com/sparklecodes",

  // SAAS / Industrial logic (if needed)
  saas: {
    enabled: true,
    useSidebarLayout: true,
    redirectAfterSignIn: "/app",
    redirectAfterLogout: "/",
  },

  // the marketing part of the application
  marketing: {
    enabled: true,
  },
} as const;

export default config;
