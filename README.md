# Next.js Sample Blog PWA

This site starts from the official [Learn Next.js](https://nextjs.org/learn) tutorial template.

## Attribution and reuse
If parts of this code were copied from a template or blog, keep the attribution above so downstream readers understand the origin. Add links to any additional sources you rely on (e.g., design kits, icon sets, or tutorials) so the provenance remains clear for future updates.

## Metadata configuration
Set `NEXT_PUBLIC_SITE_URL` to the public origin of your deployment so the Open Graph and Twitter tags render fully qualified URLs. During local development the metadata defaults to `http://localhost:8080`; in other environments, the helper falls back to relative paths if the variable is unset.

### Icon guidance
Use the dedicated Apple touch icons in `public/icons/apple-touch-icon*.png` rather than reusing the Android launcher assets. Android adaptive icons usually include transparent padding so the system can mask them into different shapes; that extra padding produces an undesired inset effect on iOS, which expects a full-bleed PNG without transparency for `rel="apple-touch-icon"`.
