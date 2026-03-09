# Translations

ViTransfer supports multiple languages. The language is set by an admin under **Settings → Language** and applies to everything: admin pages, client share pages, and email notifications.

## Currently supported languages

| Code | Language   | Status |
|------|-----------|--------|
| `en` | English   | ✅ Complete (default) |
| `nl` | Nederlands | ✅ Complete |

Want to add your language? It's easy — you only need to translate one JSON file and send it to us.

---

## How to contribute a translation

### Step 1: Download the English file

Download `en.json` from the repository:  
📁 [`src/locales/en.json`](https://github.com/MansiVisuals/ViTransfer/blob/main/src/locales/en.json)

This is the reference file with all ~1,400 strings. Rename your copy to your language code (e.g., `de.json` for German, `fr.json` for French — see [ISO 639-1 codes](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)).

### Step 2: Translate the values

Open the file in any text editor and translate **only the values** (the right side). Never touch the keys (left side):

```json
{
  "common": {
    "save": "Speichern",
    "cancel": "Abbrechen"
  }
}
```

That's it — go through the file section by section and translate each value.

### Step 3: Send it to us

Pick whatever is easiest for you:

- **GitHub Issue** — [open an issue](https://github.com/MansiVisuals/ViTransfer/issues/new) and attach your translated file
- **Pull Request** — add your `xx.json` to `src/locales/` and open a PR
- **Direct message** — reach out via the contact info on [vitransfer.com](https://vitransfer.com)

We'll review it, wire it into the app, and credit you as a contributor. You don't need to touch any code — we handle the rest.

---

## Improving an existing translation

Found a typo or a better way to phrase something? Same process:

1. Download the existing file (e.g., [`nl.json`](https://github.com/MansiVisuals/ViTransfer/blob/main/src/locales/nl.json))
2. Make your corrections
3. Send it via Issue, PR, or direct message

Even fixing a single string helps — you don't need to review the whole file.

---

## Translation rules

### Keep these in the original English

- **ViTransfer** — the app name, always stays as-is
- **Brand names** — GitHub, Docker Hub, Ko-fi, Gotify, ntfy, Pushover, Telegram, Google Calendar, Outlook, Apple Calendar
- **Technical terms** — SMTP, OTP, HTTPS, HSTS, JWT, TUS, HTML, SVG, URL, IP, VAPID, FPS, ZIP, HTTP, ProRes, PCM, PassKey, Codec
- **Format patterns** — `HH:MM:SS:FF`, `MM:SS`, `v1, v2, v3`, `720p`, `1080p`, `ABCD-1234`

### Keep placeholders intact

Some strings have variables inside `{curly braces}` — translate around them but don't rename them:

```json
"pageOf": "Seite {page} von {pages}"
```

Email templates use `{{DOUBLE_BRACES}}` and HTML tags — keep those exactly as-is:

```json
"greeting": "Hallo <strong>{{RECIPIENT_NAME}}</strong>,"
```

### Tone guidelines

| Context | Who sees it | Tone |
|---------|-------------|------|
| Admin pages (settings, projects, users) | Admins | Casual / informal |
| Client pages (share, comments, approval) | Clients | Professional / polite |
| Email templates | Clients | Formal |

For languages with formal/informal forms (e.g., German Sie/du, French vous/tu, Dutch u/je): use informal for admin, formal for client-facing content.

---

## Section reference

The file is organized by section. Here's what each one covers:

| Section | Content |
|---------|---------|
| `common` | Shared words (Save, Cancel, Delete, Loading, etc.) |
| `auth` | Login, password reset, PassKey |
| `nav` | Navigation menu |
| `projects` | Project creation, editing, archiving |
| `videos` | Uploads, versions, assets, player |
| `comments` | Feedback, replies, annotations, attachments |
| `share` | Client share page and authentication |
| `settings` | All admin settings subsections |
| `security` | Security events dashboard |
| `analytics` | Project statistics |
| `recipients` | Client recipient management |
| `clients` | Client directory |
| `users` | Admin user management |
| `calendar` | Calendar and deadlines |
| `controls` | Video player and drawing tools |
| `email` | All email notification templates |
| `reprocess` | Video reprocessing dialogs |
| `unapprove` | Project unapproval dialogs |
| `device` | Workflow integration (DaVinci Resolve, Premiere Pro) |
| `unsubscribe` | Email unsubscribe page |
| `notFound` | 404 page |
| `session` | Session timeout warnings |

---

## For developers: integrating a new language

If you're adding the translation to the codebase yourself:

1. Place `xx.json` in `src/locales/`
2. Register the locale in `src/i18n/locale.ts`:
   ```typescript
   export const SUPPORTED_LOCALES = ['en', 'nl', 'xx'] as const

   export const LOCALE_NAMES: Record<string, string> = {
     en: 'English',
     nl: 'Nederlands',
     xx: 'Your Language',
   }
   ```
3. Add the language label in `settings.language` in **every** existing locale file:
   ```json
   "language": {
     "en": "English",
     "nl": "Dutch",
     "xx": "Your Language Name"
   }
   ```
4. Validate your JSON:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('src/locales/xx.json')); console.log('Valid')"
   ```
5. Check key parity with English:
   ```bash
   node -e "
   const fs = require('fs');
   const en = JSON.parse(fs.readFileSync('src/locales/en.json'));
   const xx = JSON.parse(fs.readFileSync('src/locales/xx.json'));
   function keys(o, p) { p = p || ''; let r = []; for (const k in o) { const f = p ? p+'.'+k : k; if (typeof o[k] === 'object' && o[k]) r = r.concat(keys(o[k], f)); else r.push(f); } return r; }
   const ek = keys(en), xk = keys(xx);
   const missing = ek.filter(function(k) { return xk.indexOf(k) < 0; });
   const extra = xk.filter(function(k) { return ek.indexOf(k) < 0; });
   if (missing.length) console.log('Missing:', missing);
   if (extra.length) console.log('Extra:', extra);
   if (!missing.length && !extra.length) console.log('All keys match!');
   "
   ```
6. Run `npm run build` to confirm no type errors.

| File | Purpose |
|------|---------|
| `src/locales/en.json` | English translations (source of truth) |
| `src/locales/nl.json` | Dutch translations |
| `src/i18n/locale.ts` | Supported locales, display names, helpers |
| `src/i18n/request.ts` | next-intl config — loads language from database |
| `prisma/schema.prisma` | `Settings.language` stores the active language |

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [Translations](Translations) | [License](License)
