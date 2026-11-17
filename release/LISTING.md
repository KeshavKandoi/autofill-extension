# Chrome Web Store listing

**Name**  
Autofill

**Category**  
Productivity

**Language**  
English

**Short description**  
Fill forms on sites you choose using an encrypted local profile and answers you approve.

## Detailed description

Fill repeated forms with less typing. Autofill matches fields on websites you authorize to information you have saved, such as your name, contact details, education and portfolio links.

- Fill matching empty fields or review suggestions before using them.
- Review details you entered on an allowed page, then save answers you want to reuse.
- Manage saved answers, alternative question wording and site-specific answers.
- Choose which websites the extension can access and turn off learning whenever you like.
- Protect your saved profile in a passphrase-encrypted vault on your device.

To get started, open Manage information, create your vault and save your profile. Grant access to a site with a form. The extension works without an account or a paid AI service. You decide when to submit each form.

## Dashboard privacy fields

**Single purpose**  
Help users fill web forms on authorized sites using a local profile and answers they explicitly save.

**Storage justification**  
Store encrypted profiles and saved answers, and retain local extension preferences. Keep the derived vault key in trusted Chrome session storage while the vault is unlocked.

**Scripting justification**  
Register or inject the form assistant on websites with granted access so it can recognize form controls and fill approved matching values.

**activeTab justification**  
Identify the active tab when the user opens the toolbar popup so the popup can show the current site's access status, request access for that site and start filling.

**Optional HTTP and HTTPS host access justification**  
Forms can appear on any HTTP or HTTPS site. Users choose which hosts to grant. The assistant reads relevant field metadata and writes matching values where access is granted, or proposes saving a completed answer when learning is enabled.

**Remote code**  
The extension ships its executable code in the upload ZIP. It does not load remote scripts or models.

**Data handling summary**  
The extension handles profile details, site origins, form metadata and approved answers locally to provide autofill. Typical data categories include personally identifiable information, website content and the origins where the user enables or uses the assistant. No analytics or developer-operated collection endpoint is included. Review the publisher dashboard's checkbox wording against the current build and the privacy policy before certifying.

## Reviewer instructions

1. Open Manage information from the popup and create a local vault with a test passphrase of at least 12 characters.
2. Save a sample full name and email address under Profile.
3. To try a real page, go to an HTTP or HTTPS page with a conventional form, click Allow this site in the popup, approve Chrome's prompt and reload. Test only with sample profile data.
4. To check learning, enable Ask to save answers I enter in Settings, complete a non-sensitive unknown field on an authorized page, and choose Open page assistant from the toolbar popup to review the answer.
