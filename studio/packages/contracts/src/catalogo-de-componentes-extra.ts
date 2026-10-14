// ============================================================
// GERADO por scripts/gerar-componentes-hyperframes.mjs a partir do registro
// de componentes do HyperFrames (HeyGen, Apache 2.0): registry/components/*.
// Não editar à mão.
// ============================================================

import type { ComponenteDoCatalogo } from './catalogo-de-componentes';

export const COMPONENTES_DO_CATALOGO_EXTRA: readonly ComponenteDoCatalogo[] = [
  {
    "nome": "trust-strip",
    "grupo": "dados",
    "titulo": "Trust Strip",
    "oQue": "A monochrome trust row of wide-tracked mono wordmarks that fade in with an opacity-only left-to-right stagger, then hold dead still.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "marks",
        "tipo": "string",
        "padrao": "Northwind, Acme Corp, Globex, Initech, Umbra",
        "descricao": "Comma-separated wordmark texts (3 to 7 recommended)."
      },
      {
        "id": "tone",
        "tipo": "enum",
        "padrao": "muted",
        "descricao": "Mark color: quiet muted or full-contrast ink.",
        "opcoes": [
          "muted",
          "ink"
        ]
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated reveal starts in seconds from mount start. Empty uses the authored 0.15s stagger."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Faint palette tint mixed into the mark color.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "End-of-clip behavior. None holds to the last frame.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "avatar-cloud",
    "grupo": "dados",
    "titulo": "Avatar Cloud",
    "oQue": "Lettermark avatars populate a loose elliptical cloud while fine SVG links draw between the community and its central proof label.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "avatarCount",
        "tipo": "number",
        "padrao": 10,
        "descricao": "Number of lettermark avatars in the network cloud.",
        "min": 6,
        "max": 16
      },
      {
        "id": "showLinks",
        "tipo": "enum",
        "padrao": "yes",
        "descricao": "Show or hide the connecting network lines.",
        "opcoes": [
          "yes",
          "no"
        ]
      },
      {
        "id": "label",
        "tipo": "string",
        "padrao": "50k builders",
        "descricao": "Community proof copy shown in the center hub."
      }
    ]
  },
  {
    "nome": "testimonial-proof-card",
    "grupo": "dados",
    "titulo": "Testimonial Proof Card",
    "oQue": "A quote card whose testimonial reveals per-line through a soft mask, with an avatar disc (initials default, image slot), mono name and role, an optional company text mark, and one emphasis substring underlined in accent ink after the quote lands.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "quote",
        "tipo": "string",
        "padrao": "We shipped our launch video in a single afternoon",
        "descricao": "The testimonial line. Wraps inside the card; each rendered line reveals through its own mask."
      },
      {
        "id": "name",
        "tipo": "string",
        "padrao": "Maya Chen",
        "descricao": "Attribution name in mono. Also seeds the avatar initials."
      },
      {
        "id": "role",
        "tipo": "string",
        "padrao": "Head of Product",
        "descricao": "Attribution role in muted mono. Empty hides the line."
      },
      {
        "id": "company",
        "tipo": "string",
        "padrao": "NORTHWIND",
        "descricao": "Company mark as wide-tracked mono text at the byline end. Empty hides it."
      },
      {
        "id": "emphasis",
        "tipo": "string",
        "padrao": "single afternoon",
        "descricao": "First case-insensitive substring match in quote, expanded to whole words, gets the accent underline. Empty disables the draw."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Underline and glyph ink from the contract token map.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Default none: the card holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "social-proof-card",
    "grupo": "dados",
    "titulo": "Social Proof Card",
    "oQue": "The app-store close as one mountable scene: wordmark, five stars, a proof line, three feature icons and a CTA capsule build in a quiet stagger and hold - measured from reference ad footage. For an animated star sweep use star-rating-fill; for a quote card use testimonial-proof-card; for a bare lockup use cta-lockup",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "brand",
        "tipo": "string",
        "padrao": "HyperFrames",
        "descricao": "Wordmark at the top of the card."
      },
      {
        "id": "proof",
        "tipo": "string",
        "padrao": "12,000+ creators",
        "descricao": "Social-proof line under the stars."
      },
      {
        "id": "cta",
        "tipo": "string",
        "padrao": "Start rendering free",
        "descricao": "Label on the closing capsule."
      },
      {
        "id": "f1",
        "tipo": "string",
        "padrao": "Write|plain HTML",
        "descricao": "First feature, | breaks the line."
      },
      {
        "id": "f2",
        "tipo": "string",
        "padrao": "Render|pixel-perfect",
        "descricao": "Second feature, | breaks the line."
      },
      {
        "id": "f3",
        "tipo": "string",
        "padrao": "Own|every line",
        "descricao": "Third feature, | breaks the line."
      }
    ]
  },
  {
    "nome": "marker-checklist-card",
    "grupo": "dados",
    "titulo": "Marker Checklist Card",
    "oQue": "A hand-lettered paper card: marker headline with an underline and a drawn ellipse around one word, then three checklist rows whose checks draw themselves on - typewriter labels, marker values. The paper-and-marker sibling of mk-specs-list's clean professional rows",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "top",
        "tipo": "string",
        "padrao": "THE POWER",
        "descricao": "First marker line."
      },
      {
        "id": "mid",
        "tipo": "string",
        "padrao": "OF",
        "descricao": "Small connecting word under the underline."
      },
      {
        "id": "circled",
        "tipo": "string",
        "padrao": "ONE",
        "descricao": "The word the marker ellipse draws around."
      },
      {
        "id": "rest",
        "tipo": "string",
        "padrao": "FILE",
        "descricao": "The rest of the bottom line."
      },
      {
        "id": "l1",
        "tipo": "string",
        "padrao": "WRITE",
        "descricao": "Typewriter label of row 1."
      },
      {
        "id": "v1",
        "tipo": "string",
        "padrao": "HTML",
        "descricao": "Marker value of row 1."
      },
      {
        "id": "l2",
        "tipo": "string",
        "padrao": "RENDER",
        "descricao": "Typewriter label of row 2."
      },
      {
        "id": "v2",
        "tipo": "string",
        "padrao": "IN 4K",
        "descricao": "Marker value of row 2."
      },
      {
        "id": "l3",
        "tipo": "string",
        "padrao": "SHIP",
        "descricao": "Typewriter label of row 3."
      },
      {
        "id": "v3",
        "tipo": "string",
        "padrao": "TODAY",
        "descricao": "Marker value of row 3."
      }
    ]
  },
  {
    "nome": "wordmark-tiles",
    "grupo": "texto",
    "titulo": "Wordmark Tiles",
    "oQue": "A wordmark resolves from deterministic color noise into correctly cropped glyph tiles through a spatially modulated GSAP wave.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "LAUNCH",
        "descricao": "Text resolved by the tile wave."
      },
      {
        "id": "columns",
        "tipo": "number",
        "padrao": 12,
        "descricao": "Number of columns in the wordmark tile grid.",
        "min": 8,
        "max": 14
      },
      {
        "id": "waveStagger",
        "tipo": "number",
        "padrao": 40,
        "descricao": "Delay between tile reveals in spatial wave order.",
        "min": 15,
        "max": 50
      }
    ]
  },
  {
    "nome": "titlecard-lockup",
    "grupo": "texto",
    "titulo": "Titlecard Lockup",
    "oQue": "The calm breather titlecard: an optional mono kicker fades up, the wordmark settles dead-center with one restrained move, a hairline rule draws left to right, a mono label fades beneath, and the lockup holds truly still.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "wordmark",
        "tipo": "string",
        "padrao": "HYPERFRAMES",
        "descricao": "Display wordmark that settles dead-center."
      },
      {
        "id": "label",
        "tipo": "string",
        "padrao": "WRITE HTML. RENDER VIDEO.",
        "descricao": "Mono caption under the rule. Empty hides it."
      },
      {
        "id": "kicker",
        "tipo": "string",
        "padrao": "INTRODUCING",
        "descricao": "Small mono label above the wordmark. Empty hides it."
      },
      {
        "id": "rule",
        "tipo": "enum",
        "padrao": "show",
        "descricao": "Hairline rule drawn left to right under the wordmark.",
        "opcoes": [
          "show",
          "hide"
        ]
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Contract color carried by the hairline rule.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Frame roots own transitions, so none is the default.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "logo-brand-close",
    "grupo": "texto",
    "titulo": "Logo Brand Close",
    "oQue": "A display-scale wordmark cascades letter by letter into a centered lockup, the accent brand period lands last, an optional tagline and wide-tracked mono URL settle beneath, and the finished identity holds dead still to the end of the film.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "wordmark",
        "tipo": "string",
        "padrao": "HYPERFRAMES",
        "descricao": "Brand name whose letters cascade into the centered lockup."
      },
      {
        "id": "tagline",
        "tipo": "string",
        "padrao": "Write HTML. Render video.",
        "descricao": "Optional tagline that settles beneath the wordmark. Empty hides it."
      },
      {
        "id": "url",
        "tipo": "string",
        "padrao": "hyperframes.heygen.com",
        "descricao": "Optional mono URL line beneath the tagline. Empty hides it."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Contract color used by the brand period at the end of the wordmark.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Films end on the still hold, so the default is none.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "char-slam-explode",
    "grupo": "texto",
    "titulo": "Char Slam Explode",
    "oQue": "Headline glyphs hold in a deterministic scatter, then reassemble with an overshooting slam and a three-frame landing shake.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "Impact",
        "descricao": "Text split into glyphs for the scatter and slam."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Headline and glow color.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "spread",
        "tipo": "enum",
        "padrao": "tight",
        "descricao": "Distance and rotation of the scattered glyphs.",
        "opcoes": [
          "tight",
          "wild"
        ]
      }
    ]
  },
  {
    "nome": "variable-axis-type",
    "grupo": "texto",
    "titulo": "Variable Axis Type",
    "oQue": "A locked one-line headline whose weight or width axis morphs into a decisive emphasis beat.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "IMPACT",
        "descricao": "Word or short headline to emphasize."
      },
      {
        "id": "axis",
        "tipo": "enum",
        "padrao": "wght",
        "descricao": "Variable-font axis used for the emphasis morph.",
        "opcoes": [
          "wght",
          "wdth"
        ]
      },
      {
        "id": "fromValue",
        "tipo": "number",
        "padrao": 200,
        "descricao": "Starting coordinate on the selected font axis.",
        "min": 25,
        "max": 1000
      },
      {
        "id": "toValue",
        "tipo": "number",
        "padrao": 900,
        "descricao": "Ending coordinate on the selected font axis.",
        "min": 25,
        "max": 1000
      }
    ]
  },
  {
    "nome": "stitched-text-draw",
    "grupo": "texto",
    "titulo": "Stitched Text Draw",
    "oQue": "Text drawn as thread stitches: a single-stroke display alphabet draws via attribute-driven dashoffset with stitch-tuned dash patterns, seeded angle jitter, needle-hole dots, a leading needle, and a thread-tail overshoot per letter.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "STITCH",
        "descricao": "Uppercased A-Z 0-9 and space, clamped to 12 characters."
      },
      {
        "id": "stitch",
        "tipo": "enum",
        "padrao": "fine",
        "descricao": "Dash/gap scale, thread width, and jitter amplitude.",
        "opcoes": [
          "fine",
          "coarse"
        ]
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Thread color: green rides --brand, blue rides --accent, violet rides --accent-2.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Default none: the stitched word holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "whiteboard-ink",
    "grupo": "texto",
    "titulo": "Whiteboard Ink",
    "oQue": "A whiteboard sketch draws one measured stroke at a time while a pen nib follows the active tip. Preset sketches (bulb, flow, rocket) or your own multi-stroke SVG paths via the strokes slot; a path marked data-ink=accent rides the accent token.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "sketch",
        "tipo": "enum",
        "padrao": "bulb",
        "descricao": "Authored preset sketch to draw. Ignored when the strokes slot holds custom paths.",
        "opcoes": [
          "bulb",
          "flow",
          "rocket"
        ]
      },
      {
        "id": "caption",
        "tipo": "string",
        "padrao": "Draw the idea",
        "descricao": "Short line shown after the sketch completes."
      },
      {
        "id": "pen",
        "tipo": "enum",
        "padrao": "show",
        "descricao": "Show or hide the pen nib actor.",
        "opcoes": [
          "show",
          "hide"
        ]
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color used by strokes marked data-ink=accent (one highlight stroke in each preset).",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "How the completed lockup leaves. none holds the final frame.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "notes-typing",
    "grupo": "texto",
    "titulo": "Notes Typing",
    "oQue": "The notes-app confession as a mountable scene: a bold title, then body lines typed character by character on the measured human keystroke rhythm, the caret riding every landed character and jumping down at each paragraph. For a bare prompt line use typed-prompt; for an even mechanical reveal use typewriter",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "title",
        "tipo": "string",
        "padrao": "Things nobody told me|about video.",
        "descricao": "Bold note title. A | breaks the line."
      },
      {
        "id": "lines",
        "tipo": "string",
        "padrao": "my videos sucked|my tools cost $$$|and re-edits never end.",
        "descricao": "Pipe-separated body lines, typed one after another."
      },
      {
        "id": "speed",
        "tipo": "number",
        "padrao": 1,
        "descricao": "Typing speed multiplier. 1 is the measured human rhythm.",
        "min": 0.5,
        "max": 2
      }
    ]
  },
  {
    "nome": "typed-prompt",
    "grupo": "texto",
    "titulo": "Typed Prompt",
    "oQue": "A prompt line types itself in chunked human cadence behind a deterministic blinking caret, with optional backspace-and-retype correction of the final word.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "Generate a product launch video",
        "descricao": "The prompt that gets typed."
      },
      {
        "id": "prompt_glyph",
        "tipo": "string",
        "padrao": ">",
        "descricao": "Leading glyph before the typed line. Empty string hides it."
      },
      {
        "id": "cadence",
        "tipo": "enum",
        "padrao": "human",
        "descricao": "Keystroke rhythm: uniform fixed steps or seeded human chunks.",
        "opcoes": [
          "uniform",
          "human"
        ]
      },
      {
        "id": "caret",
        "tipo": "enum",
        "padrao": "blink",
        "descricao": "Blink runs integer sine cycles during typing then goes solid.",
        "opcoes": [
          "blink",
          "solid"
        ]
      },
      {
        "id": "correction",
        "tipo": "string",
        "padrao": "",
        "descricao": "Mistyped word typed in place of the final word, then backspaced and corrected. Empty disables."
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated seconds relative to mount start; cue N anchors the start of word N. Empty uses the authored rhythm."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color of the prompt glyph and caret.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Outgoing transition. Frame roots own transitions; none holds the end frame.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "chat-message",
    "grupo": "destaque",
    "titulo": "Chat Message",
    "oQue": "One message arrives on the measured entry - scale 0.75, 0.12s, growing from its sender's corner. The type is an enum switched like marker-highlight's style: a received or sent bubble with a real tail, a large emoji row, an image, or a link card with title and domain. The atom that chat-thread builds conversations from",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "type",
        "tipo": "enum",
        "padrao": "sent",
        "descricao": "Which message form arrives.",
        "opcoes": [
          "recv",
          "sent",
          "emoji",
          "img",
          "card"
        ]
      },
      {
        "id": "text",
        "tipo": "string",
        "padrao": "wait look 👀",
        "descricao": "Bubble text, or the emoji row for the Emoji type."
      },
      {
        "id": "cardTitle",
        "tipo": "string",
        "padrao": "HyperFrames — Write HTML, render pixel-perfect video",
        "descricao": "Link-card title (Link card type only)."
      },
      {
        "id": "cardDomain",
        "tipo": "string",
        "padrao": "hyperframes.heygen.com",
        "descricao": "Link-card domain line (Link card type only)."
      },
      {
        "id": "tail",
        "tipo": "enum",
        "padrao": "on",
        "descricao": "The bubble tail anchoring the message to its side.",
        "opcoes": [
          "on",
          "off"
        ]
      },
      {
        "id": "delivered",
        "tipo": "enum",
        "padrao": "on",
        "descricao": "The receipt under a sent message.",
        "opcoes": [
          "on",
          "off"
        ]
      }
    ]
  },
  {
    "nome": "chat-thread",
    "grupo": "destaque",
    "titulo": "Chat Thread",
    "oQue": "The measured conversation as one mountable scene at full fidelity: status bar, back badge, avatar and name pill, bubbles with real iMessage tails, a Delivered receipt, large emoji rows, a media placeholder, a link card, and typing dots holding the beat. Every message picks its type by prefix - recv:/sent: text, emoji: a large row, img media, card:Title~domain a link card - and heights are measured at mount so any thread fits",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "contact",
        "tipo": "string",
        "padrao": "Rachel",
        "descricao": "Name in the thread header; the avatar shows its first letter."
      },
      {
        "id": "unread",
        "tipo": "number",
        "padrao": 12,
        "descricao": "Count in the back-button badge. 0 hides it.",
        "min": 0,
        "max": 99
      },
      {
        "id": "messages",
        "tipo": "string",
        "padrao": "recv:what r u using for the launch video??|sent:wait look 👀|card:HyperFrames — Write HTML, render pixel-perfect video~hyperframes.heygen.com|recv:OMG IT&#39;S HTML|emoji:🤯🤯🤯|sent:renders in 4K. no editor",
        "descricao": "Pipe-separated thread. Each entry picks its type by prefix: recv: or sent: for a text bubble, emoji: for a large emoji row, img for a media placeholder, card:Title~domain for a link card. Example: recv:hey|sent:look 👀|card:HyperFrames~hyperframes.heygen.com|emoji:🤯🤯🤯"
      },
      {
        "id": "beat",
        "tipo": "number",
        "padrao": 1.7,
        "descricao": "Seconds between message arrivals.",
        "min": 0.8,
        "max": 3
      },
      {
        "id": "dots",
        "tipo": "enum",
        "padrao": "on",
        "descricao": "Show the three-dot indicator before received messages.",
        "opcoes": [
          "on",
          "off"
        ]
      },
      {
        "id": "receipt",
        "tipo": "enum",
        "padrao": "on",
        "descricao": "Show Delivered under the last sent bubble, as iMessage does.",
        "opcoes": [
          "on",
          "off"
        ]
      }
    ]
  },
  {
    "nome": "cta-lockup",
    "grupo": "destaque",
    "titulo": "CTA Lockup",
    "oQue": "A canonical closing lockup that reveals an action line, pops in an accent CTA capsule, settles supporting microcopy, and holds with confidence.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "action_line",
        "tipo": "string",
        "padrao": "Start building today",
        "descricao": "Primary action statement shown above the CTA."
      },
      {
        "id": "button_label",
        "tipo": "string",
        "padrao": "Get HyperFrames",
        "descricao": "Text displayed inside the CTA capsule."
      },
      {
        "id": "microcopy",
        "tipo": "string",
        "padrao": "Free while in beta",
        "descricao": "Supporting detail shown below the CTA capsule."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Fill color used by the CTA capsule.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      }
    ]
  },
  {
    "nome": "store-badge-lockup",
    "grupo": "destaque",
    "titulo": "Store Badge Lockup",
    "oQue": "Settles a short headline above equal-size App Store and Google Play badges as a token-driven mobile end-card call to action.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "headline",
        "tipo": "string",
        "padrao": "Get the app",
        "descricao": "Short action line shown above the store badges."
      },
      {
        "id": "showApple",
        "tipo": "enum",
        "padrao": "yes",
        "descricao": "Show or hide the App Store badge.",
        "opcoes": [
          "yes",
          "no"
        ]
      },
      {
        "id": "showGoogle",
        "tipo": "enum",
        "padrao": "yes",
        "descricao": "Show or hide the Google Play badge.",
        "opcoes": [
          "yes",
          "no"
        ]
      }
    ]
  },
  {
    "nome": "toggle-flip",
    "grupo": "destaque",
    "titulo": "Toggle Flip",
    "oQue": "An oversized UI toggle switch that flips with real physicality: thumb overshoot, track color crossfade, and a soft press-compress before release. The reference prop of the ui-props family.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "direction",
        "tipo": "enum",
        "padrao": "on",
        "descricao": "Target end state the flip lands on.",
        "opcoes": [
          "on",
          "off"
        ]
      },
      {
        "id": "label",
        "tipo": "string",
        "padrao": "Auto-save",
        "descricao": "Optional caption under the toggle. Blank hides the line."
      },
      {
        "id": "size",
        "tipo": "number",
        "padrao": 40,
        "descricao": "Toggle width as a percent of the host box width.",
        "min": 20,
        "max": 70
      }
    ]
  },
  {
    "nome": "gesture-tap",
    "grupo": "destaque",
    "titulo": "Gesture Tap",
    "oQue": "A contact circle taps a mobile pill button, releases it into a new labeled accent state, and lifts away.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "tap_label",
        "tipo": "string",
        "padrao": "Follow",
        "descricao": "Button label shown before the tap response."
      },
      {
        "id": "response_label",
        "tipo": "string",
        "padrao": "Following",
        "descricao": "Button label shown when the tap releases."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color used for the completed button state and response pulse.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      }
    ]
  },
  {
    "nome": "press-ripple",
    "grupo": "destaque",
    "titulo": "Press Ripple",
    "oQue": "A cursor decel-arrives from off-stage, lands slightly off-center on a caller-positioned target, compresses with it in lockstep, releases with two small click rings while the label swaps to a check, then exits off-stage while the confirmed state holds.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "label",
        "tipo": "string",
        "padrao": "Get started",
        "descricao": "Text inside the default pill target."
      },
      {
        "id": "done_label",
        "tipo": "string",
        "padrao": "Saved",
        "descricao": "Text beside the check once the default pill is pressed."
      },
      {
        "id": "target_x",
        "tipo": "number",
        "padrao": 50,
        "descricao": "Zone center, percent of host width.",
        "min": 8,
        "max": 92
      },
      {
        "id": "target_y",
        "tipo": "number",
        "padrao": 50,
        "descricao": "Zone center, percent of host height.",
        "min": 8,
        "max": 92
      },
      {
        "id": "press_at",
        "tipo": "number",
        "padrao": 0.9,
        "descricao": "Seconds from mount start when the press begins.",
        "min": 0.9,
        "max": 10
      },
      {
        "id": "cursor",
        "tipo": "enum",
        "padrao": "light",
        "descricao": "Pointer tone.",
        "opcoes": [
          "light",
          "dark"
        ]
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Contract color for the click rings and the confirmation check.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "How the frame leaves. None holds the pressed state.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "before-after-wipe",
    "grupo": "destaque",
    "titulo": "Before After Wipe",
    "oQue": "Two full-bleed content slots compare before and after states as a persistent divider wipes the after layer over the before layer and rests at a configurable split. Callers fill the named before/after slot panels; token-styled defaults render when a slot is left empty.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "label_a",
        "tipo": "string",
        "padrao": "Before",
        "descricao": "Chip shown on the base before panel. Blank hides the chip."
      },
      {
        "id": "label_b",
        "tipo": "string",
        "padrao": "After",
        "descricao": "Chip shown on the revealed after panel. Blank hides the chip."
      },
      {
        "id": "rest_split",
        "tipo": "number",
        "padrao": 50,
        "descricao": "Divider resting position after the wipe lands.",
        "min": 0,
        "max": 100
      },
      {
        "id": "wipe_at",
        "tipo": "number",
        "padrao": 0.25,
        "descricao": "Seconds after mount start when the wipe begins.",
        "min": 0,
        "max": 8
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Divider handle and after chip color.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Outgoing transition. None holds the final comparison frame.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "split-tilt-cards",
    "grupo": "destaque",
    "titulo": "Split Tilt Cards",
    "oQue": "Two equal-weight cards arrive from opposite wings with mirrored rotateY book-open tilts under one shared perspective, pill badges spring-pop at each inner edge, and the pair holds with a barely-there phase-opposed idle float. Card bodies are content slots with token skeleton defaults.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "label_a",
        "tipo": "string",
        "padrao": "Before",
        "descricao": "Mono header on the left card. Blank hides it."
      },
      {
        "id": "label_b",
        "tipo": "string",
        "padrao": "After",
        "descricao": "Mono header on the right card. Blank hides it."
      },
      {
        "id": "badge_a",
        "tipo": "string",
        "padrao": "v1",
        "descricao": "Pill badge that spring-pops at the left card inner edge. Blank disables it."
      },
      {
        "id": "badge_b",
        "tipo": "string",
        "padrao": "v2",
        "descricao": "Pill badge that spring-pops at the right card inner edge. Blank disables it."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Right-card tint, right badge, and right ambient glow color.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Outgoing transition. None holds the final spread.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "scroll-feed",
    "grupo": "destaque",
    "titulo": "Scroll Feed",
    "oQue": "A loop-friendly column of varied skeleton post cards scrolls upward with subtle motion trails and an agitated pace.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "speed",
        "tipo": "enum",
        "padrao": "doom",
        "descricao": "Pace of the upward feed movement.",
        "opcoes": [
          "doom",
          "frantic"
        ]
      },
      {
        "id": "card_count",
        "tipo": "number",
        "padrao": 6,
        "descricao": "Number of skeleton posts in one repeated feed cycle.",
        "min": 4,
        "max": 10
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated seconds (from mount start); each cue advances the feed by one card. Empty synthesizes evenly spaced flicks, one per card."
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Default none: the feed scrolls until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "swipe-rail",
    "grupo": "destaque",
    "titulo": "Swipe Rail",
    "oQue": "A contact circle leads a horizontal card rail through a fast drag, momentum carry, and settled snap to the next card.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "card_count",
        "tipo": "number",
        "padrao": 4,
        "descricao": "Number of cards rendered in the rail.",
        "min": 3,
        "max": 5
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Active color used by the focused card and contact circle.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "card_label_prefix",
        "tipo": "string",
        "padrao": "Feature",
        "descricao": "Text placed before each card number."
      }
    ]
  },
  {
    "nome": "screen-flow-carousel",
    "grupo": "destaque",
    "titulo": "Screen Flow Carousel",
    "oQue": "Two to five app screens ride a horizontal rail: one primary at center, neighbors receded, advancing on cues with a velocity-matched throw and a smooth long-tail catch while a mono caption swaps with each advance. Screens are slots with token skeleton defaults.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "screens",
        "tipo": "number",
        "padrao": 3,
        "descricao": "How many screens ride the rail.",
        "min": 2,
        "max": 5
      },
      {
        "id": "captions",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated caption per screen. Blank entries use the authored defaults."
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated advance times in seconds from mount start. Blank entries use the authored even rhythm."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Token the active ring, caption dot, and skeleton accents ride.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Default none: the final screen holds until the cut.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "sticky-mock-swap",
    "grupo": "destaque",
    "titulo": "Sticky Mock Swap",
    "oQue": "A pinned product mock cross-fades through accent-tinted feature states while matching captions rise, hold, and exit beside it.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "captions",
        "tipo": "string",
        "padrao": "Instant previews,Zero config,Ship on Friday",
        "descricao": "Comma-separated feature captions shown beside the pinned mock."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "violet",
        "descricao": "Accent tint used across the mock states.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      }
    ]
  },
  {
    "nome": "telemetry-hud",
    "grupo": "destaque",
    "titulo": "Telemetry HUD",
    "oQue": "Quiet mono debug-HUD readouts frame a slotted subject: corner brackets draw on, label:value lines tick their values on cues, one readout emphasized in accent. The subject never moves; the HUD breathes zero.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "readouts",
        "tipo": "string",
        "padrao": "fps:59.94,latency:11.8 ms,gpu:38%,heap:1.2 GB",
        "descricao": "Comma-separated label:value pairs, up to 8. The first colon splits label from value."
      },
      {
        "id": "emphasize",
        "tipo": "number",
        "padrao": 0,
        "descricao": "Index of the readout rendered in the accent color. -1 disables.",
        "min": -1,
        "max": 7
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated seconds relative to mount start; cue N starts readout N value tick. Empty uses the authored rhythm."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color of the emphasized readout.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Outgoing transition. Frame roots own transitions; none holds the end frame.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "spring-stack-shuffle",
    "grupo": "destaque",
    "titulo": "Spring Stack Shuffle",
    "oQue": "A stack of 3 to 5 slotted cards reshuffles on cues: the back card throws over the top and lands at the front with real mass, the rest compress and resettle; cues that land mid-flight redirect the moving cards with velocity preserved.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "cards",
        "tipo": "number",
        "padrao": 4,
        "descricao": "Number of cards in the stack, 3 to 5.",
        "min": 3,
        "max": 5
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "0.9, 1.7, 1.95",
        "descricao": "Comma-separated seconds from mount start; each cue throws the back card to the front. Cues inside a running throw redirect it mid-flight, velocity preserved. Empty keeps the default rhythm."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Active-card ring color from the contract token map.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Default none: the settled stack holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "dart-cursor",
    "grupo": "destaque",
    "titulo": "Dart Cursor",
    "oQue": "A bold outlined arrowhead that dives in from camera depth, flies nose-first with motion blur along its path, squashes on two clicks, and whips out of frame.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "tone",
        "tipo": "enum",
        "padrao": "dark",
        "descricao": "Tone",
        "opcoes": [
          "dark",
          "light"
        ]
      },
      {
        "id": "target_x",
        "tipo": "number",
        "padrao": 34,
        "descricao": "First click X",
        "min": 5,
        "max": 95
      },
      {
        "id": "target_y",
        "tipo": "number",
        "padrao": 58,
        "descricao": "First click Y",
        "min": 5,
        "max": 95
      },
      {
        "id": "target2_x",
        "tipo": "number",
        "padrao": 64,
        "descricao": "Second click X",
        "min": 5,
        "max": 95
      },
      {
        "id": "target2_y",
        "tipo": "number",
        "padrao": 46,
        "descricao": "Second click Y",
        "min": 5,
        "max": 95
      },
      {
        "id": "enter_from",
        "tipo": "enum",
        "padrao": "right",
        "descricao": "Enter from",
        "opcoes": [
          "right",
          "left",
          "top",
          "bottom"
        ]
      },
      {
        "id": "exit_to",
        "tipo": "enum",
        "padrao": "right",
        "descricao": "Exit to",
        "opcoes": [
          "right",
          "left",
          "top",
          "bottom"
        ]
      },
      {
        "id": "blur",
        "tipo": "number",
        "padrao": 1,
        "descricao": "Motion blur",
        "min": 0,
        "max": 1.5
      }
    ]
  },
  {
    "nome": "cursor-annotate",
    "grupo": "destaque",
    "titulo": "Annotate Cursor",
    "oQue": "A marker pen glides onto the frame and hand-draws a loose loop, an underline, or an arrow around a region, the ink laid exactly under its nib, then lifts and leaves.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "shape",
        "tipo": "enum",
        "padrao": "circle",
        "descricao": "Mark",
        "opcoes": [
          "circle",
          "underline",
          "arrow"
        ]
      },
      {
        "id": "color",
        "tipo": "color",
        "padrao": "#f43f5e",
        "descricao": "Ink"
      },
      {
        "id": "target_x",
        "tipo": "number",
        "padrao": 40,
        "descricao": "Region left",
        "min": 0,
        "max": 95
      },
      {
        "id": "target_y",
        "tipo": "number",
        "padrao": 38,
        "descricao": "Region top",
        "min": 0,
        "max": 95
      },
      {
        "id": "target_w",
        "tipo": "number",
        "padrao": 20,
        "descricao": "Region width",
        "min": 2,
        "max": 90
      },
      {
        "id": "target_h",
        "tipo": "number",
        "padrao": 16,
        "descricao": "Region height",
        "min": 2,
        "max": 90
      }
    ]
  },
  {
    "nome": "magnetic-cursor",
    "grupo": "destaque",
    "titulo": "Magnetic Cursor",
    "oQue": "A soft dot pointer glides across an editor toolbar, is pulled into each button and morphs into its rounded hover plate while the icon leans toward it, presses one, and leaves as a dot.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "accent",
        "tipo": "color",
        "padrao": "#3b82f6",
        "descricao": "Accent"
      },
      {
        "id": "tone",
        "tipo": "enum",
        "padrao": "light",
        "descricao": "Tone",
        "opcoes": [
          "light",
          "dark"
        ]
      },
      {
        "id": "visits",
        "tipo": "string",
        "padrao": "0,3",
        "descricao": "Comma-separated indexes 0-5: bold, italic, underline, link, list, image."
      },
      {
        "id": "press",
        "tipo": "number",
        "padrao": 2,
        "descricao": "Pressed visit",
        "min": 1,
        "max": 3
      }
    ]
  },
  {
    "nome": "touch-indicator",
    "grupo": "destaque",
    "titulo": "Touch Indicator",
    "oQue": "A translucent contact-circle gesture actor for mobile UI scenes: it touches the glass on the frame the host target responds, then lifts. Tap or swipe, picked by variable.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "gesture",
        "tipo": "enum",
        "padrao": "tap",
        "descricao": "Gesture",
        "opcoes": [
          "tap",
          "swipe"
        ]
      },
      {
        "id": "polarity",
        "tipo": "enum",
        "padrao": "light",
        "descricao": "Polarity",
        "opcoes": [
          "light",
          "dark"
        ]
      },
      {
        "id": "targetX",
        "tipo": "number",
        "padrao": 50,
        "descricao": "Target X",
        "min": 0,
        "max": 100
      },
      {
        "id": "targetY",
        "tipo": "number",
        "padrao": 55,
        "descricao": "Target Y",
        "min": 0,
        "max": 100
      }
    ]
  },
  {
    "nome": "cursor-drag-drop",
    "grupo": "destaque",
    "titulo": "Drag and Drop Cursor",
    "oQue": "A cursor grabs a task card, lifts and tilts it into its motion, carries it in lockstep to an empty column, drops it with a small settle, and the list closes the gap behind it.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "card_label",
        "tipo": "string",
        "padrao": "Fix checkout validation",
        "descricao": "Dragged card"
      },
      {
        "id": "accent",
        "tipo": "color",
        "padrao": "#0a84ff",
        "descricao": "Accent"
      },
      {
        "id": "tone",
        "tipo": "enum",
        "padrao": "light",
        "descricao": "Board tone",
        "opcoes": [
          "light",
          "dark"
        ]
      }
    ]
  },
  {
    "nome": "oversized-cursor",
    "grupo": "destaque",
    "titulo": "Oversized Cursor",
    "oQue": "The look-here pointer for a video: the macOS arrow at 3.5x its normal size lands its tip on one control, clicks it on, settles just below it so the result stays in view, then exits off-screen",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "cursor_variant",
        "tipo": "enum",
        "padrao": "light",
        "descricao": "Cursor fill",
        "opcoes": [
          "light",
          "dark"
        ]
      },
      {
        "id": "target_x",
        "tipo": "number",
        "padrao": 55,
        "descricao": "Target X",
        "min": 15,
        "max": 85
      },
      {
        "id": "target_y",
        "tipo": "number",
        "padrao": 55,
        "descricao": "Target Y",
        "min": 15,
        "max": 85
      },
      {
        "id": "click_label",
        "tipo": "string",
        "padrao": "Generate",
        "descricao": "Click label"
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional whole-stage departure. Default none: the ignited target stays until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "cursor-context-menu",
    "grupo": "destaque",
    "titulo": "Context Menu Cursor",
    "oQue": "A cursor right-clicks a file, a context menu blooms from its tip, the hover highlight tracks the item under it, and the chosen action plays out: duplicate, rename, move to trash, or a confirmation toast.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "items",
        "tipo": "string",
        "padrao": "Open,Rename,Duplicate,Share,Move to Trash",
        "descricao": "Menu items"
      },
      {
        "id": "pick",
        "tipo": "number",
        "padrao": 2,
        "descricao": "Chosen item (0 = first)",
        "min": 0,
        "max": 9
      },
      {
        "id": "tone",
        "tipo": "enum",
        "padrao": "light",
        "descricao": "Tone",
        "opcoes": [
          "light",
          "dark"
        ]
      }
    ]
  },
  {
    "nome": "multiplayer-cursors",
    "grupo": "destaque",
    "titulo": "Multiplayer Cursors",
    "oQue": "Labeled collaborator cursors with token-derived colors and soft glows drift from spread positions into a shared center zone, proving live multiplayer presence.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "cursorCount",
        "tipo": "number",
        "padrao": 4,
        "descricao": "Number of labeled collaborator cursors.",
        "min": 2,
        "max": 6
      },
      {
        "id": "labels",
        "tipo": "string",
        "padrao": "Ana,Ken,Wen,Mia",
        "descricao": "Comma-separated cursor names, in order."
      }
    ]
  },
  {
    "nome": "agent-cursor",
    "grupo": "destaque",
    "titulo": "Agent Cursor",
    "oQue": "An AI agent operating a UI: a cursor with an accent name label that types out each step, clicks each target with a small ring, and ends on a check.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "agent_name",
        "tipo": "string",
        "padrao": "Agent",
        "descricao": "Agent name"
      },
      {
        "id": "steps",
        "tipo": "string",
        "padrao": "Reading the page,Opening Settings,Turning on backups,Done",
        "descricao": "Comma-separated: a reading line, one line per target, then a done line."
      },
      {
        "id": "targets",
        "tipo": "string",
        "padrao": "25,47;76,30",
        "descricao": "Semicolon-separated x,y points in percent of the frame."
      },
      {
        "id": "accent",
        "tipo": "color",
        "padrao": "#0a84ff",
        "descricao": "Accent"
      }
    ]
  },
  {
    "nome": "cursor-glyph-trail",
    "grupo": "destaque",
    "titulo": "Cursor Glyph Trail",
    "oQue": "A tutorial cursor path: on a settings screen the arrow clicks through three steps, leaving a dotted trail spaced evenly by distance and a numbered marker at each click; each step's trail fades as the next move begins.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "glyphs",
        "tipo": "string",
        "padrao": "",
        "descricao": "Deprecated and ignored: the trail draws evenly spaced dots."
      },
      {
        "id": "density",
        "tipo": "enum",
        "padrao": "med",
        "descricao": "Spacing between trail dots.",
        "opcoes": [
          "low",
          "med",
          "high"
        ]
      },
      {
        "id": "path",
        "tipo": "enum",
        "padrao": "sweep",
        "descricao": "How each move bends: sweep is a gentle curve, arc a deeper one, zigzag a straight line.",
        "opcoes": [
          "sweep",
          "arc",
          "zigzag"
        ]
      },
      {
        "id": "fade",
        "tipo": "number",
        "padrao": 0.5,
        "descricao": "Seconds a step trail takes to fade once the next move begins, clamped 0.3 to 1.5."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Trail and step marker color: green rides --brand, blue rides --accent, violet rides --accent-2.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Default none: the finished screen holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "gloss-sweep",
    "grupo": "destaque",
    "titulo": "Gloss Sweep",
    "oQue": "A card lands with a restrained slam, catches one diagonal specular gloss, and holds perfectly still.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "Pro",
        "descricao": "Text displayed on the card."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color treatment for the card.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "sweep_angle",
        "tipo": "number",
        "padrao": 25,
        "descricao": "Angle of the specular gloss in degrees.",
        "min": -60,
        "max": 60
      }
    ]
  },
  {
    "nome": "light-sweep-pass",
    "grupo": "destaque",
    "titulo": "Light Sweep Pass",
    "oQue": "A traveling key light re-shades a slotted scene: a soft diagonal gradient band crosses the frame once while every per-element highlight and shadow shifts in lockstep (all driven by one --light-x property), then the light settles into a resting key. Quiet, expensive-feeling; the scene itself never moves. Callers fill the named scene slot; a token hero-and-cards default renders when it is left empty.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "angle",
        "tipo": "number",
        "padrao": 115,
        "descricao": "Band and highlight gradient angle in degrees.",
        "min": 60,
        "max": 160
      },
      {
        "id": "sweep_at",
        "tipo": "number",
        "padrao": 0.9,
        "descricao": "Seconds after mount start when the band starts crossing.",
        "min": 0,
        "max": 8
      },
      {
        "id": "strength",
        "tipo": "enum",
        "padrao": "standard",
        "descricao": "Band opacity and highlight bloom multiplier.",
        "opcoes": [
          "subtle",
          "standard"
        ]
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Tint inside the band and the highlight blooms.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Outgoing transition. None holds the settled key.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "svg-mask-reveal",
    "grupo": "destaque",
    "titulo": "SVG Mask Reveal",
    "oQue": "A soft token-colored sweep reveals media only through an editable SVG wordmark mask.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "REVEAL",
        "descricao": "Text used as the SVG mask window."
      },
      {
        "id": "revealProgress",
        "tipo": "number",
        "padrao": 100,
        "descricao": "Final revealed width of the wordmark.",
        "min": 0,
        "max": 100
      },
      {
        "id": "featherPx",
        "tipo": "number",
        "padrao": 24,
        "descricao": "Softness of the traveling reveal edge.",
        "min": 0,
        "max": 120
      }
    ]
  },
  {
    "nome": "radial-surround",
    "grupo": "destaque",
    "titulo": "Radial Surround",
    "oQue": "Labeled hairline chips assemble around a centered subject on an elliptical ring, then optionally converge inward with a subtle edge dim. The center never moves: surrounded, not zoomed.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "center_label",
        "tipo": "string",
        "padrao": "Your team",
        "descricao": "Label on the default center token card."
      },
      {
        "id": "chips",
        "tipo": "string",
        "padrao": "Docs,Tickets,Dashboards,Inbox,Chat,Sheets",
        "descricao": "Comma-separated chip labels that surround the center (up to 12)."
      },
      {
        "id": "close_in",
        "tipo": "boolean",
        "padrao": true,
        "descricao": "Converge the ring inward with a subtle edge dim after assembly. The center never moves."
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated per-chip entrance times in seconds. Blank entries use the default cascade."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Accent token family used by the center card tint.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "How the surrounded stage leaves the frame. Default none: the crowded hold ends the film.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "overwhelm-surround",
    "grupo": "destaque",
    "titulo": "Overwhelm Surround",
    "oQue": "Tasks, tabs, pings, and notification bubbles accelerate inward around a calm central subject, turning overload into visible spatial pressure.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "count",
        "tipo": "number",
        "padrao": 16,
        "descricao": "Number of tasks and notifications crowding the center.",
        "min": 8,
        "max": 24
      },
      {
        "id": "centerLabel",
        "tipo": "string",
        "padrao": "You",
        "descricao": "Text inside the calm central subject. Blank hides the text."
      },
      {
        "id": "intensity",
        "tipo": "number",
        "padrao": 1,
        "descricao": "How tightly and quickly the chips crowd the center.",
        "min": 0.5,
        "max": 2
      }
    ]
  },
  {
    "nome": "locked-nucleus-orbit",
    "grupo": "destaque",
    "titulo": "Locked Nucleus Orbit",
    "oQue": "A fixed center nucleus anchors deterministic satellite orbits that settle into a composed lockup.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "label",
        "tipo": "string",
        "padrao": "core",
        "descricao": "Text displayed inside the fixed center nucleus."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color used by the nucleus, rings, and satellite markers.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "satellites",
        "tipo": "number",
        "padrao": 4,
        "descricao": "Number of orbiting copy chips.",
        "min": 3,
        "max": 6
      }
    ]
  },
  {
    "nome": "constellation-hub",
    "grupo": "destaque",
    "titulo": "Constellation Hub",
    "oQue": "Feature nodes brighten in narration order as real-length SVG connectors draw outward from a fixed central hub, then settle into one lockup.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "hub_label",
        "tipo": "string",
        "padrao": "Product",
        "descricao": "Text displayed inside the fixed central hub."
      },
      {
        "id": "nodes",
        "tipo": "string",
        "padrao": "Capture,Compose,Render,Share",
        "descricao": "Comma-separated feature labels introduced in narration order."
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated seconds (from mount start) for each node reveal. Empty keeps the authored even spread."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Highlight color used by the hub, connectors, and active nodes.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Default none: the lockup holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "velocity-throw-snap",
    "grupo": "destaque",
    "titulo": "Velocity Throw Snap",
    "oQue": "A five-shot rail whips past on a fast decaying curve, then overshoots and snaps the selected hero shot exactly to center.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "hero_index",
        "tipo": "number",
        "padrao": 2,
        "descricao": "Zero-based index of the shot centered at the settle.",
        "min": 0,
        "max": 4
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Highlight color used by the hero shot.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "card_label_prefix",
        "tipo": "string",
        "padrao": "Shot",
        "descricao": "Text placed before each shot number."
      }
    ]
  },
  {
    "nome": "facet-morph",
    "grupo": "destaque",
    "titulo": "Facet Morph",
    "oQue": "A faceted low-poly mass of 36 triangles continuously reshapes between three authored silhouettes (blob, mark, badge) with per-facet flat shading that recomputes as the vertices move. Light reads from the upper left; lit facets lift toward a pale accent-tinted tone while turned-away facets fall toward near-black. One calm continuous morph, then a settled hold.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "forms",
        "tipo": "string",
        "padrao": "blob,mark,badge",
        "descricao": "Comma-separated silhouette sequence from blob, mark, badge."
      },
      {
        "id": "hold_last",
        "tipo": "boolean",
        "padrao": true,
        "descricao": "True settles dead still on the final silhouette; false keeps the mass slowly breathing through the hold."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Tint of the lit facets.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Outgoing transition. None holds the settled mass.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "scan-band",
    "grupo": "destaque",
    "titulo": "Scan Band",
    "oQue": "A diagonal distortion band sweeps once across a clean wordmark, revealing clipped red and cyan offsets only inside the moving band.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "wordmark",
        "tipo": "string",
        "padrao": "HYPERFRAMES",
        "descricao": "Text displayed by the scan effect."
      },
      {
        "id": "band_angle",
        "tipo": "number",
        "padrao": 12,
        "descricao": "Diagonal angle of the distortion band in degrees.",
        "min": -30,
        "max": 30
      }
    ]
  },
  {
    "nome": "beat-accent",
    "grupo": "destaque",
    "titulo": "Beat Accent",
    "oQue": "A single music-hit sting: impact flash, micro scale-pulse on the subject, immediate decay.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "BOOM",
        "descricao": "Word or short label emphasized by the beat hit."
      },
      {
        "id": "flashColor",
        "tipo": "enum",
        "padrao": "accent",
        "descricao": "Token-backed accent tone used by the radial flash.",
        "opcoes": [
          "accent",
          "soft",
          "bright"
        ]
      },
      {
        "id": "intensity",
        "tipo": "number",
        "padrao": 1,
        "descricao": "Strength of the scale pulse, flash, and shake.",
        "min": 0.5,
        "max": 2
      }
    ]
  },
  {
    "nome": "icon-morph-beat",
    "grupo": "destaque",
    "titulo": "Icon Morph Beat",
    "oQue": "An icon morphs between authored state silhouettes, shifts to an accent color, and marks completion with one restrained pulse.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "pair",
        "tipo": "enum",
        "padrao": "mic-check",
        "descricao": "Before and after icon states used by the morph.",
        "opcoes": [
          "mic-check",
          "play-check",
          "lock-unlock"
        ]
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color applied as the morph completes.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      }
    ]
  },
  {
    "nome": "tracing-beam",
    "grupo": "destaque",
    "titulo": "Tracing Beam",
    "oQue": "A glowing dash follows one SVG path through three UI elements, lifting and brightening each element in sequence.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "labels",
        "tipo": "string",
        "padrao": "Search,Preview,Export",
        "descricao": "Three comma-separated labels shown in path order."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "cyan",
        "descricao": "Beam and active-element color.",
        "opcoes": [
          "cyan",
          "violet",
          "amber"
        ]
      }
    ]
  },
  {
    "nome": "offset-path-traveler",
    "grupo": "destaque",
    "titulo": "Offset Path Traveler",
    "oQue": "A slotted traveler follows an authored path with tangent rotation, curved entry, and curved exit.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "path",
        "tipo": "string",
        "padrao": "M -90 390 C 150 490 190 70 430 185 C 650 300 720 105 850 145 C 970 180 1030 85 1090 35",
        "descricao": "SVG path data authored in a 1000 by 500 route viewBox."
      },
      {
        "id": "traveler_label",
        "tipo": "string",
        "padrao": "Live preview",
        "descricao": "Text displayed inside the default traveler chip."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color used by the traveler and route.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      }
    ]
  },
  {
    "nome": "logo-sting",
    "grupo": "destaque",
    "titulo": "Logo Sting",
    "oQue": "A wordmark slams into its final scale, fires one accent ring and one white impact frame, then holds completely still.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "wordmark",
        "tipo": "string",
        "padrao": "HYPERFRAMES",
        "descricao": "Brand name displayed in the final lockup."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color of the single impact ring.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      }
    ]
  }
];
