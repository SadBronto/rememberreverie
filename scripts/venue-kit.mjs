// Venue kit generator.
//
//   node scripts/venue-kit.mjs playbook
//       -> "Venue Kit/Reverie Install Playbook.docx"   (internal, for you)
//
//   node scripts/venue-kit.mjs packet --venue "Moose Lounge North" --slug moose --code moosestaff2026 [--contact "hello@rememberreverie.com"]
//       -> "Venue Kit/<venue> Packet.docx"             (give this to the venue; real QR codes)
//
// No dashes of the long kind anywhere in the text. Keep it that way.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, WidthType, BorderStyle, ShadingType, LevelFormat, PageBreak, HeadingLevel,
} from 'docx'

const require = createRequire(import.meta.url)
const qrcode = require('qrcode-generator')

const OUT = path.resolve('Venue Kit')
fs.mkdirSync(OUT, { recursive: true })

// ---------- helpers ----------
const FONT = 'Georgia'
const W = 9360 // content width, US Letter with 1 inch margins

const t = (text, o = {}) => new TextRun({ text, font: FONT, size: 22, ...o })
const p = (text, o = {}) => new Paragraph({ spacing: { after: 120 }, ...o.para, children: [t(text, o)] })
const rich = (parts, para = {}) => new Paragraph({
  spacing: { after: 120 }, ...para,
  children: parts.map(x => typeof x === 'string' ? t(x) : t(x[0], x[1])),
})
const h1 = text => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 }, children: [new TextRun({ text, font: FONT, bold: true, size: 32 })] })
const h2 = text => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 }, children: [new TextRun({ text, font: FONT, bold: true, size: 26 })] })
const bullet = (text, level = 0) => new Paragraph({ numbering: { reference: 'bullets', level }, spacing: { after: 70 }, children: Array.isArray(text) ? text.map(x => typeof x === 'string' ? t(x) : t(x[0], x[1])) : [t(text)] })
const step = (text, ref = 'steps') => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 90 }, children: Array.isArray(text) ? text.map(x => typeof x === 'string' ? t(x) : t(x[0], x[1])) : [t(text)] })
const pageBreak = () => new Paragraph({ children: [new PageBreak()] })
const center = (text, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: o.after ?? 120 }, children: [t(text, o)] })

const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' }
const borders = { top: border, bottom: border, left: border, right: border }
function table(cols, rows, header = true) {
  const sum = cols.reduce((a, b) => a + b, 0)
  return new Table({
    width: { size: sum, type: WidthType.DXA },
    columnWidths: cols,
    rows: rows.map((r, i) => new TableRow({
      children: r.map((cell, c) => new TableCell({
        borders,
        width: { size: cols[c], type: WidthType.DXA },
        margins: { top: 70, bottom: 70, left: 110, right: 110 },
        shading: header && i === 0 ? { fill: 'EFE9DD', type: ShadingType.CLEAR } : undefined,
        children: String(cell).split('\n').map(line => new Paragraph({ spacing: { after: 40 }, children: [t(line, { bold: header && i === 0, size: 20 })] })),
      })),
    })),
  })
}

function qrImage(url, px = 190) {
  const q = qrcode(0, 'M')
  q.addData(url)
  q.make()
  const dataUrl = q.createDataURL(8, 8) // gif
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new ImageRun({ type: 'gif', data: buf, transformation: { width: px, height: px }, altText: { title: 'QR code', description: url, name: 'qr' } })],
  })
}

function makeDoc(children, title) {
  return new Document({
    title,
    creator: 'Remember Reverie',
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, font: FONT }, paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, font: FONT }, paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } },
        ] },
        ...['steps', 'steps2', 'steps3', 'steps4', 'steps5', 'steps6'].map(ref => ({
          reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }],
        })),
      ],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1300, right: 1440, bottom: 1300, left: 1440 } } },
      children,
    }],
  })
}

// ---------- PLAYBOOK (internal) ----------
function playbook() {
  const c = []
  c.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Remember Reverie', font: FONT, size: 20, color: '8A7A6A', allCaps: true })] }))
  c.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'Venue install playbook', font: FONT, size: 44, bold: true })] }))
  c.push(p('Internal. Everything you need to set up, install, hand over, and watch a Reverie Live venue. The venue packet (a separate document) is what you leave with them.', { italics: true }))

  c.push(h1('1. What you are setting up'))
  c.push(p('A TV at the venue runs a 24/7 slideshow of guest photos. Patrons scan a QR code, take photos with the Reverie camera in their phone browser, and the photos appear on the TV. Staff can remove anything inappropriate from their own phone. You watch the health of every venue from the admin Health page, and you get an email if a display goes quiet.'))
  c.push(p('The only hardware is a small streaming stick plugged into the TV. Everything else is the website.'))

  c.push(h1('2. What to buy'))
  c.push(table([2400, 4200, 2760], [
    ['Item', 'Why', 'Rough cost'],
    ['Onn 4K Plus (Google TV)', 'The streaming stick that runs the slideshow. Same family as Moose. Buy at Walmart. Check the model on the box.', 'About $30'],
    ['Spare Onn stick', 'Carry one. If a venue stick dies you swap it in 5 minutes and mail the dead one back.', 'About $30'],
    ['Short HDMI extension cable', 'For TVs where the HDMI port is cramped or the stick does not fit against the wall.', '$8 to $10'],
    ['Wall power adapter', 'Use the one in the box. Plug it into a wall outlet, not the TV USB port (many TVs cut USB power when the TV is off, which makes the stick reboot every day).', 'In the box'],
    ['Ethernet option', 'Only if the venue Wi-Fi is weak at the TV. The Onn 4K Pro has a built in Ethernet port; the 4K Plus does not. Check the box before buying.', 'About $50 for the Pro'],
    ['Velcro or cable ties, painter tape', 'Tidy the cables so nobody unplugs it by accident.', 'A few dollars'],
    ['Printed poster and stand', 'Patron QR sign. Print from the admin Print page. A small acrylic or table stand keeps it up.', 'A few dollars each'],
    ['Staff card and reset sheet', 'From the venue packet. Print on card stock. Tape the reset sheet near the TV.', 'Printing only'],
  ]))
  c.push(p(''))
  c.push(rich([['Also needed once: ', { bold: true }], 'a Google account for the stick. Use a dedicated account for Reverie devices (not your personal one). One shared account is fine for all venues.']))

  c.push(h1('3. Before you go (at your desk)'))
  c.push(p('You can build the whole event without the host. Admin > New Event: leave Host email blank, type the venue name, create. It goes live immediately and only you can manage it. You add their email later to hand over control.'))
  c.push(h2('Event settings to set in admin'))
  c.push(table([3200, 6160], [
    ['Setting', 'What to set'],
    ['Name', 'The venue name, as patrons should see it.'],
    ['Plan', 'Reverie Live (needed for the slideshow and the automatic photo screening).'],
    ['Custom URL (slug)', 'Short and easy to say, like "moose". This becomes rememberreverie.com/moose and slideshow.rememberreverie.com/moose.'],
    ['Looks (camera modes)', 'Turn on the ones the venue wants. All six is fine for a bar.'],
    ['Photo cap', '500 is what Moose uses. A lobby slideshow reads best with a rolling set; older photos roll off, pinned photos stay.'],
    ['Slow polling', 'ON for 24/7 venues. It cuts server cost about 10 times and is plenty fast for a bar.'],
    ['Show new photos right away', 'ON. A new photo appears within moments instead of waiting for its place in a long slideshow. People see the payoff and take more.'],
    ['Scan to share slide', 'ON. It puts the QR code on the TV itself so every person looking at the screen can join.'],
    ['Location fence (geofence)', 'ON, centered on the venue, radius about 150 m. Keeps the camera to people actually there. Leave the bypass code off.'],
    ['Staff moderation code', 'A password for the staff page. Short and speakable. Example: venuenamestaff2026. Different per venue.'],
    ['Display monitoring', 'ON. If the venue closes overnight, set Hours start and end so you are not alerted for a TV that is off on purpose.'],
  ]))
  c.push(h2('Prepare the printed items'))
  c.push(step('Admin > the event > Print sign. Print the patron poster.', 'steps'))
  c.push(step('Run the packet script (command below) to make the venue packet with real QR codes. Print it.', 'steps'))
  c.push(step('Test from your own phone, at your desk: scan the patron QR, take a photo. Location fence will block you away from the venue, which is correct. Turn the fence off for the test, or test on site.', 'steps'))
  c.push(rich([['Packet command: ', { bold: true }], ['node scripts/venue-kit.mjs packet --venue "Venue Name" --slug slug --code staffcode', { font: 'Courier New', size: 20 }]]))

  c.push(h1('4. On site: install the stick'))
  c.push(p('Allow 30 to 45 minutes. Google TV menu wording changes slightly between versions. The steps below match what you did at Moose. Fix any wording that is off after your next install and I will update this document.', { italics: true }))
  c.push(h2('A. Hardware'))
  c.push(step('Plug the stick into a free HDMI port on the TV. Note which input number it is.', 'steps2'))
  c.push(step('Plug the power adapter into a wall outlet. Run the cable neatly and tape or tie it down.', 'steps2'))
  c.push(step('Turn the TV on and switch to that HDMI input. Use the stick remote to do first time setup.', 'steps2'))
  c.push(step('Connect to the venue Wi-Fi. Use the main network. Avoid guest networks that show a login or terms page, because the stick cannot click through it. If that is all they have, ask the venue for a normal password network or use Ethernet.', 'steps2'))
  c.push(step('Sign in with the shared Reverie Google account. Skip any optional offers.', 'steps2'))
  c.push(rich([['Order matters. ', { bold: true }], 'Once the kiosk app is running, it keeps itself in front of everything, including the Google TV settings menu. So do EVERY device setting first (B), install the app without opening it (C), and open it only at the very end (D).']))
  c.push(h2('B. Device settings (do all of these BEFORE the kiosk app is ever opened)'))
  c.push(step('Google TV Settings > System > Ambient mode (screensaver): turn it off or set the longest timeout.', 'steps3'))
  c.push(step('Settings > System > Power and energy: turn off any "turn off after" or sleep timer.', 'steps3'))
  c.push(step('Settings > Apps > Security and restrictions (or "Install unknown apps"): allow Downloader to install apps. You need this to install the kiosk app.', 'steps3'))
  c.push(step('If the TV supports HDMI-CEC, you can let the TV wake the stick. Not required.', 'steps3'))
  c.push(h2('C. Install the kiosk app (do NOT open it yet)'))
  c.push(step('Install the Downloader app from the Play Store.', 'steps4'))
  c.push(step('In Downloader, get the Screenlite Web Kiosk APK from the project releases page (github.com/screenlite/android-web-kiosk) or from IzzyOnDroid, then install it.', 'steps4'))
  c.push(step('When the installer finishes it offers Open or Done. Choose Done. Do not open it.', 'steps4'))
  c.push(h2('D. Launch the kiosk app (last step)'))
  c.push(step('Open Screenlite Web Kiosk. When it asks, grant "Display over other apps". It will not run without that.', 'steps5'))
  c.push(step('Open its settings: press the center OK button on the remote 5 times within 2 seconds.', 'steps5'))
  c.push(step([ 'Set the Kiosk URL to ', ['https://slideshow.rememberreverie.com/<slug>', { bold: true }], ' (use the venue slug). Save.' ], 'steps5'))
  c.push(step('The app starts automatically whenever the stick boots; there is no setting to turn on.', 'steps5'))
  c.push(step('Prove it survives a power cut: unplug the stick, wait 10 seconds, plug it back in. The slideshow should return on its own in about a minute with nobody touching the remote.', 'steps5'))
  c.push(p('If the slideshow does not come back after a power cut, the stick may be blocking background starts. You will need to change that in device settings (search for "autostart" or "over other apps"), but the kiosk app will keep covering the settings screen. I have not verified a way out of that lock. If you get stuck, note exactly what worked and tell me so it can go in here.', { italics: true }))

  c.push(h1('5. On site: verify it works'))
  c.push(table([600, 8760], [
    ['', 'Check'],
    ['[ ]', 'Slideshow shows on the TV, full screen, no menu bar or cursor.'],
    ['[ ]', 'Patron QR: scan it with your phone, take a photo, confirm it appears on the TV (new photos show right away).'],
    ['[ ]', 'Staff page: open rememberreverie.com/staff/<slug>, enter the code, remove your test photo, confirm it leaves the TV (a few seconds, or up to 5 minutes at worst).'],
    ['[ ]', 'Power cut test passed (end of section 4D).'],
    ['[ ]', 'Admin > Health shows the venue as OK within about 10 minutes.'],
    ['[ ]', 'Poster placed where patrons look. Staff card and reset sheet handed over and taped up.'],
  ]))
  c.push(p(''))
  c.push(rich([['Staff walkthrough (2 minutes): ', { bold: true }], 'show one staff member how to scan the staff QR, enter the code, tap a photo, and remove it. Show them the reset sheet. That is all they need to know.']))

  c.push(h1('6. Watching venues from home'))
  c.push(bullet([['Health page: ', { bold: true }], 'Admin > Health. Each display shows OK, Offline, Frozen, Closed hours, or Not reporting, with the last check-in and the app build.']))
  c.push(bullet([['Check-in timing: ', { bold: true }], 'the stick reports every 5 minutes. "Last slide change" is measured at the last check-in, so it can lag by up to 5 minutes. That is normal.']))
  c.push(bullet([['Alerts: ', { bold: true }], 'you get an email when a display has been silent for 15 minutes, or its slides have not changed for 15 minutes. You get a "back" email when it recovers, and a reminder each day while it stays down.']))
  c.push(bullet([['Issue log: ', { bold: true }], 'the same page keeps 90 days of crashes, failed page loads, failed uploads, and display problems per venue.']))
  c.push(bullet([['After install: ', { bold: true }], 'check the Health page the next morning and again after a week. Look for the build number matching the live site.']))

  c.push(h1('7. Handing the event to the venue'))
  c.push(step('Admin > the event > Contact email: type the venue contact email. Save.', 'steps6'))
  c.push(step('Click Send login email. They get a link to their own gallery and settings.', 'steps6'))
  c.push(step('From then on they (and you, as admin) can manage it. Until then it is admin-only.', 'steps6'))

  c.push(h1('8. Troubleshooting'))
  c.push(table([2700, 6660], [
    ['Symptom', 'What to do'],
    ['TV shows nothing / "No signal"', 'Wrong HDMI input, or the stick has no power. Check the wall adapter and the input.'],
    ['Blank white page', 'Unplug the stick 10 seconds, plug back in. The page now repairs itself within a minute or two once it can reach the internet; a power cycle is the fallback.'],
    ['Slideshow does not come back after power cut', 'Open Screenlite settings (OK x5), confirm the URL. Confirm "Display over other apps" is granted. Search device settings for "autostart" and allow the app.'],
    ['"Reconnecting" on screen', 'The stick cannot reach the internet. Check Wi-Fi; it keeps retrying and recovers by itself.'],
    ['"Slideshow not found"', 'The slug is wrong or the event is not active. Check the URL in Screenlite and the event in admin.'],
    ['Photos not appearing', 'Check Admin > Health for upload failures. Check the event is active, the camera window is open, and the photo cap is not hit.'],
    ['A patron cannot open the camera', 'Likely the location fence (GPS off, or they are outside the radius). Ask them to turn on location.'],
    ['Health shows Not reporting', 'The stick is running an older build and has not reloaded. It reloads itself every 6 hours or on a power cycle.'],
    ['Health shows Offline', 'No check-in for 15 minutes. Stick unplugged, Wi-Fi down, or venue closed. Call the venue.'],
  ]))

  c.push(h1('9. Known limits (be honest with venues)'))
  c.push(bullet('If the TV is switched off but the stick stays powered, the system cannot tell. It sees a healthy stick.'))
  c.push(bullet('If the stick cannot reach the internet at boot, the page cannot load and nothing on our side can fix that. It recovers when the internet returns.'))
  c.push(bullet('Automatic photo screening is Google Vision SafeSearch. It catches most explicit content, not everything. The staff page is the backstop.'))
  c.push(bullet('Alert emails depend on the Resend email key being set in Netlify. Confirm that before relying on alerts for venues you cannot visit.'))

  c.push(h1('10. Still to decide'))
  c.push(bullet('Venue monthly price (we discussed about $49 a month; not approved).'))
  c.push(bullet('A short venue agreement (what you provide, what they provide, how to cancel, photo and privacy terms). Have a lawyer review it once the LLC is formed.'))
  c.push(bullet('Who owns the stick (you lend it, or the venue buys it) and what happens when they cancel.'))
  c.push(bullet('A support contact for venues (phone or text), since they will not email at 9 p.m. on a Saturday.'))

  return makeDoc(c, 'Reverie install playbook')
}

// ---------- PACKET (venue-specific) ----------
function packet({ venue, slug, code, contact }) {
  const patronUrl = `https://rememberreverie.com/${slug}`
  const staffUrl = `https://rememberreverie.com/staff/${slug}`
  const c = []

  // Page 1: welcome
  c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'Remember Reverie', font: FONT, size: 20, color: '8A7A6A', allCaps: true })] }))
  c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: venue, font: FONT, size: 44, bold: true })] }))
  c.push(center('Your live photo wall', { size: 26, italics: true, after: 300 }))
  c.push(h2('How it works'))
  c.push(step('Patrons scan the QR code on the poster or on the TV.', 'steps'))
  c.push(step('Their phone opens a retro camera. No app, no account.', 'steps'))
  c.push(step('They take photos. The photos appear on the TV, usually within moments.', 'steps'))
  c.push(h2('What you do'))
  c.push(p('Nothing, day to day. The TV runs by itself, all day and all night. It starts itself after a power cut. We watch it and are told if it stops.'))
  c.push(h2('Keeping it suitable'))
  c.push(p('Every photo is checked automatically for inappropriate content before it goes on the screen. If anything gets through, any staff member can remove it in a few seconds from their own phone. The next page shows how.'))
  c.push(center('Patron QR code', { size: 20, bold: true, after: 60 }))
  c.push(qrImage(patronUrl, 170))
  c.push(center(patronUrl.replace('https://', ''), { size: 20, after: 60 }))
  c.push(pageBreak())

  // Page 2: staff card
  c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'STAFF ONLY', font: FONT, size: 20, bold: true, color: '8A7A6A' })] }))
  c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: 'Remove a photo from the screen', font: FONT, size: 38, bold: true })] }))
  c.push(qrImage(staffUrl, 190))
  c.push(center(staffUrl.replace('https://', ''), { size: 20, after: 140 }))
  c.push(step('Scan the code above with your phone camera.', 'steps2'))
  c.push(step([ 'Enter the password: ', [code, { bold: true, font: 'Courier New' }] ], 'steps2'))
  c.push(step('You will see the photos currently on the TV, newest first.', 'steps2'))
  c.push(step('Tap the photo. Tap Remove, then confirm.', 'steps2'))
  c.push(step('It leaves the TV within seconds. In rare cases it can take up to 5 minutes.', 'steps2'))
  c.push(p(''))
  c.push(rich([['If you are not sure, remove it. ', { bold: true }], 'Removed photos are not deleted. They go to a private archive that we can review and restore.']))
  c.push(rich([['Please keep the password to staff. ', { bold: true }], 'If it gets out, tell us and we will change it.']))
  c.push(pageBreak())

  // Page 3: reset sheet
  c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: 'If the screen is blank or stuck', font: FONT, size: 38, bold: true })] }))
  c.push(h2('Try this first (takes about 2 minutes)'))
  c.push(step('Find the small streaming stick plugged into the back of the TV.', 'steps3'))
  c.push(step('Unplug its power cable. Count to 10. Plug it back in.', 'steps3'))
  c.push(step('Wait up to 2 minutes. The slideshow comes back by itself. Do not press anything on the remote.', 'steps3'))
  c.push(h2('Still not working?'))
  c.push(bullet('Check the TV is on and set to the right input (HDMI). A "No signal" message means the wrong input.'))
  c.push(bullet('Check the venue Wi-Fi is working. The stick needs the internet.'))
  c.push(bullet('If the TV shows "Reconnecting", that is the internet. It fixes itself when the Wi-Fi returns.'))
  c.push(h2('Still stuck? Contact us'))
  c.push(p(contact, { bold: true }))
  c.push(p('Tell us the venue name and what you see on the screen. A photo of the screen helps.'))
  c.push(p(''))
  c.push(h2('Good to know'))
  c.push(bullet('Please do not unplug the stick to charge something else. It needs constant power.'))
  c.push(bullet('You do not need to turn the slideshow on or off. Turning the TV off at night is fine.'))
  c.push(bullet('Photos roll off as new ones come in. We keep a rolling set on the screen.'))

  return makeDoc(c, `${venue} packet`)
}

// ---------- main ----------
const [, , cmd, ...rest] = process.argv
const args = {}
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, '')] = rest[i + 1]

if (cmd === 'playbook') {
  const file = path.join(OUT, 'Reverie Install Playbook.docx')
  const buf = await Packer.toBuffer(playbook())
  try { fs.writeFileSync(file, buf); console.log('wrote', file) }
  catch (e) {
    // The old copy is open in Word (locked). Save alongside it instead.
    if (e.code !== 'EBUSY') throw e
    const alt = file.replace('.docx', ' (new).docx')
    fs.writeFileSync(alt, buf); console.log('old copy is open in Word; wrote', alt)
  }
} else if (cmd === 'packet') {
  if (!args.venue || !args.slug || !args.code) { console.error('Need --venue --slug --code'); process.exit(1) }
  const file = path.join(OUT, `${args.venue} Packet.docx`)
  fs.writeFileSync(file, await Packer.toBuffer(packet({ venue: args.venue, slug: args.slug, code: args.code, contact: args.contact ?? 'hello@rememberreverie.com' })))
  console.log('wrote', file)
} else {
  console.error('Usage: node scripts/venue-kit.mjs playbook | packet --venue "Name" --slug slug --code staffcode [--contact "..."]')
  process.exit(1)
}
