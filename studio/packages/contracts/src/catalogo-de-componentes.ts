// ============================================================
// GERADO (scripts de manutenção) a partir do registro de componentes do
// HyperFrames (HeyGen, Apache 2.0): registry/components/*. Curadoria para
// vídeo explicativo de pessoa falando. Não editar à mão.
// ============================================================

export interface VariavelDoComponente {
  id: string;
  tipo: string;
  padrao: unknown;
  descricao: string;
  opcoes?: unknown[];
  min?: number;
  max?: number;
}

/** Um componente do catálogo do HyperFrames montável numa animação (os fontes ficam em ./componentes-hyperframes). */
export interface ComponenteDoCatalogo {
  nome: string;
  grupo: 'dados' | 'texto' | 'destaque';
  titulo: string;
  oQue: string;
  quando: string;
  evitar: string;
  /** Entrada, espera e saída (IN/HOLD/OUT) do componente. */
  envelope: string;
  variaveis: VariavelDoComponente[];
}

export const COMPONENTES_DO_CATALOGO: readonly ComponenteDoCatalogo[] = [
  {
    "nome": "conic-progress-ring",
    "grupo": "dados",
    "titulo": "Conic Progress Ring",
    "oQue": "A token-driven conic progress ring whose angular fill and center count settle together from one registered percentage.",
    "quando": "",
    "evitar": "",
    "envelope": "IN 1.40s fixed fill and synchronized count, power2.out HOLD elastic and deliberately still after the result settles OUT 0.50s fixed opacity release, power2.in For durations shorter than 1.90s, IN and OUT scale together. HOLD is the only elastic phase. The timeline is never time-scaled.",
    "variaveis": [
      {
        "id": "progress",
        "tipo": "number",
        "padrao": 100,
        "descricao": "Target angular fill from 0 to 100.",
        "min": 0,
        "max": 100
      },
      {
        "id": "thickness",
        "tipo": "number",
        "padrao": 12,
        "descricao": "Ring stroke thickness as a percent of the ring radius.",
        "min": 4,
        "max": 30
      },
      {
        "id": "label",
        "tipo": "string",
        "padrao": "100",
        "descricao": "Numeric target shown in the center and counted in sync with the fill."
      }
    ]
  },
  {
    "nome": "count-up",
    "grupo": "dados",
    "titulo": "Count Up",
    "oQue": "A token-native stat counter that eases from start to end, lands on the exact final integer with one restrained scale pulse, and holds.",
    "quando": "One number is the proof: users, revenue, speedup, and it should land exactly as narration states it.",
    "evitar": "The stat needs context or comparison; a lone number without a chart or label reads hollow, reach for chart-story.",
    "envelope": "",
    "variaveis": [
      {
        "id": "start",
        "tipo": "number",
        "padrao": 0,
        "descricao": "First value shown by the count."
      },
      {
        "id": "end",
        "tipo": "number",
        "padrao": 100,
        "descricao": "Final value where the count lands."
      },
      {
        "id": "prefix",
        "tipo": "string",
        "padrao": "",
        "descricao": "Optional text shown before the value."
      },
      {
        "id": "suffix",
        "tipo": "string",
        "padrao": "%",
        "descricao": "Optional text shown after the value."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color used by the count.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "glow",
        "tipo": "boolean",
        "padrao": false,
        "descricao": "Optional soft accent glow under the count. Off by default."
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Default none: the landed value holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "star-rating-fill",
    "grupo": "dados",
    "titulo": "Star Rating Fill",
    "oQue": "A token-driven star row whose colored layer sweeps to a rating, preserves the fractional final star, and can count the value in sync.",
    "quando": "",
    "evitar": "",
    "envelope": "IN 1.50s fixed sweep, count, and per-star pop, power2.out HOLD elastic and deliberately still so the proof remains readable OUT 0.40s fixed opacity release, power2.in For durations shorter than 1.90s, IN and OUT scale together. HOLD is the only elastic phase, and the timeline is never time-scaled.",
    "variaveis": [
      {
        "id": "rating",
        "tipo": "number",
        "padrao": 4.8,
        "descricao": "Target rating in star units from 0 to 5.",
        "min": 0,
        "max": 5
      },
      {
        "id": "starCount",
        "tipo": "number",
        "padrao": 5,
        "descricao": "Number of stars shown in the row.",
        "min": 1,
        "max": 10
      },
      {
        "id": "showValue",
        "tipo": "enum",
        "padrao": "yes",
        "descricao": "Show or hide the synchronized numeric rating.",
        "opcoes": [
          "yes",
          "no"
        ]
      }
    ]
  },
  {
    "nome": "decline-chart",
    "grupo": "dados",
    "titulo": "Decline Chart",
    "oQue": "A metric line draws downward as its value counts down and the ambient background darkens in lockstep.",
    "quando": "",
    "evitar": "",
    "envelope": "IN_BASE = 0.55s chart frame settles into view HOLD = elastic decline draw, countdown, and ambient darkening OUT_BASE = 0.45s bottomed-out endpoint locks in with no recovery If D is shorter than IN_BASE + OUT_BASE, IN and OUT compress together and HOLD collapses to zero. Longer mounts stretch HOLD on",
    "variaveis": [
      {
        "id": "label",
        "tipo": "string",
        "padrao": "Retention",
        "descricao": "Label shown above the declining value."
      },
      {
        "id": "start_value",
        "tipo": "number",
        "padrao": 82,
        "descricao": "Metric value at the start of the decline.",
        "min": 0,
        "max": 100
      },
      {
        "id": "end_value",
        "tipo": "number",
        "padrao": 34,
        "descricao": "Metric value at the bottom of the decline.",
        "min": 0,
        "max": 100
      }
    ]
  },
  {
    "nome": "chart-story",
    "grupo": "dados",
    "titulo": "Chart Story",
    "oQue": "One chart builds from data in reading order and lands the exact supplied values: staggered bars, a left-to-right line with area fill, a sweeping donut, or filling progress bars, with an accent callout on the emphasized datum.",
    "quando": "The proof is a trend or comparison across several values and one datum should carry the story.",
    "evitar": "There is only one number to show (use count-up) or the data needs live interactivity; this is an authored build, not a chart widget.",
    "envelope": "",
    "variaveis": [
      {
        "id": "type",
        "tipo": "enum",
        "padrao": "bars",
        "descricao": "Chart form the data builds into.",
        "opcoes": [
          "bars",
          "line",
          "donut",
          "progress"
        ]
      },
      {
        "id": "data",
        "tipo": "string",
        "padrao": "12, 28, 45, 64",
        "descricao": "Comma-separated numbers; the chart lands exactly on these values."
      },
      {
        "id": "labels",
        "tipo": "string",
        "padrao": "Q1, Q2, Q3, Q4",
        "descricao": "Comma-separated labels, one per datum."
      },
      {
        "id": "emphasize",
        "tipo": "number",
        "padrao": 3,
        "descricao": "Index of the datum that takes the accent and the value callout. Clamped to the data range."
      },
      {
        "id": "unit",
        "tipo": "string",
        "padrao": "%",
        "descricao": "Suffix appended to every displayed value."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Contract color used by the emphasized datum and its callout.",
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
        "descricao": "Optional departure. Proof stats end on the still hold, so the default is none.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "state-chip-rail",
    "grupo": "dados",
    "titulo": "State Chip Rail",
    "oQue": "A rail of mono status chips advances a seek-safe data-state snap machine on a cue schedule: active chip ink on surface, done chips dim, pending chips hollow, optional badges pop beside one state.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "states",
        "tipo": "string",
        "padrao": "Queued,Reading,Drafting,Done",
        "descricao": "Comma-separated chip labels in machine order (2 to 8 states)."
      },
      {
        "id": "times",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated activation times in seconds, one per advance (state 1 onward). Blank entries use the default even rhythm."
      },
      {
        "id": "badge_state",
        "tipo": "number",
        "padrao": 1,
        "descricao": "Index of the state the badges pop beside.",
        "min": 0,
        "max": 7
      },
      {
        "id": "badges",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated badge labels shown beside the badge state. Empty disables."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Accent token family used by the active chip.",
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
        "descricao": "How the rail leaves the frame. Default none: the hold ends the film.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "svg-stroke-trace",
    "grupo": "dados",
    "titulo": "SVG Stroke Trace",
    "oQue": "An authored SVG path draws from its measured length, holds with subtle drift, and fills after the stroke when the path is closed with Z.",
    "quando": "A custom mark, signature, underline flourish, or simple line drawing should draw itself on screen.",
    "evitar": "The artwork is multi-stroke or needs a visible pen; use whiteboard-ink, which sequences strokes with a nib actor.",
    "envelope": "",
    "variaveis": [
      {
        "id": "path",
        "tipo": "string",
        "padrao": "M 92 328 C 178 142 292 138 366 276 C 430 396 500 414 558 262 C 622 94 724 112 786 274 C 836 406 894 376 930 194",
        "descricao": "SVG path data for the authored mark."
      },
      {
        "id": "stroke_width",
        "tipo": "number",
        "padrao": 12,
        "descricao": "Width of the traced stroke in SVG viewBox units.",
        "min": 2,
        "max": 32
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color used by the trace and optional fill.",
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
        "descricao": "Optional departure. Default none: the finished mark holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "per-word-rise",
    "grupo": "texto",
    "titulo": "Per Word Rise",
    "oQue": "Words or characters rise into place in a controlled blur-to-sharp cascade, drift gently, and hold until the cut.",
    "quando": "A headline or key line should land word by word in sync with narration beats.",
    "evitar": "The line must swap or replace text mid-scene; this unit only reveals one static line.",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "WORDS IN MOTION",
        "descricao": "Text whose words or characters rise into place."
      },
      {
        "id": "split",
        "tipo": "enum",
        "padrao": "word",
        "descricao": "Animate the text as words or individual characters.",
        "opcoes": [
          "word",
          "char"
        ]
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated seconds (from mount start) for each unit landing. Empty keeps the authored cascade rhythm."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Contract accent token used for the text color.",
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
        "descricao": "Optional departure. Default none: the line holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "kinetic-type-swap",
    "grupo": "texto",
    "titulo": "Kinetic Type Swap",
    "oQue": "A held sentence keeps its fixed prefix and suffix while one masked word slot rolls through alternatives and settles on the final option.",
    "quando": "One sentence must carry multiple value words (\"Ship faster, smarter, together\") without reflowing the line.",
    "evitar": "The alternatives differ wildly in length or you need more than a handful of swaps; the slot pre-sizes to the widest option and long lists drag.",
    "envelope": "",
    "variaveis": [
      {
        "id": "prefix",
        "tipo": "string",
        "padrao": "Ship",
        "descricao": "Fixed sentence text before the rolling word slot."
      },
      {
        "id": "options",
        "tipo": "string",
        "padrao": "faster,smarter,together",
        "descricao": "Comma-separated words shown in the rolling slot."
      },
      {
        "id": "suffix",
        "tipo": "string",
        "padrao": "",
        "descricao": "Fixed sentence text after the rolling word slot."
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated seconds (from mount start) for each word swap. Empty keeps the authored even spread."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color used by the rolling word slot.",
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
        "descricao": "Optional departure. Default none: the sentence holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "kinetic-center-build",
    "grupo": "texto",
    "titulo": "Kinetic Center Build",
    "oQue": "Words enter from the right and push the growing phrase left until the final line locks centered.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "Words push left.",
        "descricao": "Short phrase that builds one word at a time."
      },
      {
        "id": "font_size",
        "tipo": "number",
        "padrao": 72,
        "descricao": "Maximum text size in pixels. Longer phrases shrink to stay inside the frame.",
        "min": 36,
        "max": 160
      },
      {
        "id": "entry_offset",
        "tipo": "number",
        "padrao": 88,
        "descricao": "Horizontal distance each new word travels before it lands.",
        "min": 20,
        "max": 160
      },
      {
        "id": "color",
        "tipo": "color",
        "padrao": "#171717",
        "descricao": "Text color for the full phrase."
      },
      {
        "id": "font_weight",
        "tipo": "enum",
        "padrao": "600",
        "descricao": "Weight used by every word in the phrase.",
        "opcoes": [
          "500",
          "600",
          "700",
          "800"
        ]
      }
    ]
  },
  {
    "nome": "line-swap",
    "grupo": "texto",
    "titulo": "Line Swap",
    "oQue": "A masked full-line beat replacement: line A holds center then exits up through an overflow-hidden mask as line B enters bottom-up on the same beat, with an optional accent underline drawing beneath one word of line B.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "line_a",
        "tipo": "string",
        "padrao": "Everyone promised you AI.",
        "descricao": "First line; holds center inside the mask, then exits up on the swap beat."
      },
      {
        "id": "line_b",
        "tipo": "string",
        "padrao": "Almost nobody promised you control.",
        "descricao": "Replacement line; enters bottom-up on the swap beat and holds."
      },
      {
        "id": "swap_at",
        "tipo": "number",
        "padrao": 1.5,
        "descricao": "Second (from mount start) of the beat replacement. Clamped so the swap and underline complete before any exit.",
        "min": 0
      },
      {
        "id": "underline_word",
        "tipo": "string",
        "padrao": "control",
        "descricao": "First case-insensitive substring match in line B gets the accent underline after landing. Empty disables it."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Underline color from the contract token map.",
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
        "descricao": "Optional departure. Default none: the landed line holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "text-shimmer",
    "grupo": "texto",
    "titulo": "Text Shimmer",
    "oQue": "A static headline receives one clean specular gradient sweep through its glyphs, then returns to its ordinary text color.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "Effortless",
        "descricao": "Text receiving the single shimmer pass."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Hue of the specular shimmer band.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "sweep_at",
        "tipo": "number",
        "padrao": 1.2,
        "descricao": "Requested start time for the shimmer sweep.",
        "min": 0.2,
        "max": 2
      }
    ]
  },
  {
    "nome": "scramble-reveal",
    "grupo": "texto",
    "titulo": "Scramble Reveal",
    "oQue": "A deterministic hacker-style reveal that cycles fixed glyph rows and locks the target string left to right.",
    "quando": "A product name, feature name, or technical claim should resolve with a terminal or engineering flavor.",
    "evitar": "The brand voice is calm or premium; the glyph churn reads noisy against quiet scenes (use titlecard-lockup or per-word-rise).",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "HYPERFRAMES",
        "descricao": "Target string that resolves from deterministic wrong glyphs."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color used by the text, prefix, and optional terminal frame.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "style",
        "tipo": "enum",
        "padrao": "terminal",
        "descricao": "Terminal frame or clean text-only presentation.",
        "opcoes": [
          "terminal",
          "clean"
        ]
      },
      {
        "id": "exit",
        "tipo": "enum",
        "padrao": "none",
        "descricao": "Optional departure. Default none: the locked string holds until the frame cuts.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "headline-slam",
    "grupo": "texto",
    "titulo": "Headline Slam",
    "oQue": "A heavyweight headline scales down into frame, lands with a deterministic three-frame shake, holds with subtle drift, and whips upward on exit.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "Ship it today",
        "descricao": "Text displayed as the headline."
      },
      {
        "id": "accent_word_index",
        "tipo": "number",
        "padrao": 1,
        "descricao": "Zero-based word index to color. Out of range leaves the headline unaccented."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color applied to the selected word.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      },
      {
        "id": "shadow",
        "tipo": "boolean",
        "padrao": true,
        "descricao": "Drop shadow cast under the headline. On by default; set false for a flat matte look."
      }
    ]
  },
  {
    "nome": "marker-highlight",
    "grupo": "texto",
    "titulo": "Marker Highlight",
    "oQue": "Display text settles in, then one hand-drawn marker stroke (highlight, circle, underline, or scribble) draws over the emphasized word on cue.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "Ship it with confidence",
        "descricao": "Full line of display text."
      },
      {
        "id": "emphasis_word",
        "tipo": "string",
        "padrao": "confidence",
        "descricao": "First case-insensitive substring match in text receives the marker. Empty or unmatched draws no marker."
      },
      {
        "id": "style",
        "tipo": "enum",
        "padrao": "highlight",
        "descricao": "Shape of the hand-drawn marker stroke.",
        "opcoes": [
          "highlight",
          "circle",
          "underline",
          "scribble"
        ]
      },
      {
        "id": "draw_at",
        "tipo": "number",
        "padrao": 0.9,
        "descricao": "Second (from mount start) the marker starts drawing. Clamped so the stroke completes before any exit.",
        "min": 0
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Marker ink color from the contract token map.",
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
    "nome": "vox-annotate",
    "grupo": "texto",
    "titulo": "Vox Annotate",
    "oQue": "The Vox-style annotate gesture: a keyword in a held sentence gets a hand-drawn marker while a thin connector draws up to a mono callout label, all as one choreographed beat on the cue.",
    "quando": "a phrase needs an editorial aside or explanation, documentary style.",
    "evitar": "plain emphasis with no callout is enough; keep the sentence clean instead.",
    "envelope": "",
    "variaveis": [
      {
        "id": "text",
        "tipo": "string",
        "padrao": "Ship the story, not the spec",
        "descricao": "Full line of display text."
      },
      {
        "id": "keyword",
        "tipo": "string",
        "padrao": "story",
        "descricao": "First case-insensitive substring match in text receives the marker and annotation. Empty or unmatched draws nothing."
      },
      {
        "id": "note",
        "tipo": "string",
        "padrao": "the annotate beat",
        "descricao": "Mono callout label at the end of the connector. Empty draws the marker only."
      },
      {
        "id": "style",
        "tipo": "enum",
        "padrao": "highlight",
        "descricao": "Shape of the hand-drawn marker stroke.",
        "opcoes": [
          "highlight",
          "circle",
          "underline",
          "scribble"
        ]
      },
      {
        "id": "draw_at",
        "tipo": "number",
        "padrao": 0.9,
        "descricao": "Second (from mount start) the annotate gesture starts. Clamped so the gesture completes before any exit.",
        "min": 0
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Annotation ink color from the contract token map.",
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
    "nome": "ticker-takeover",
    "grupo": "texto",
    "titulo": "Ticker Takeover",
    "oQue": "A mono ticker rolls through options, locks on a final word with an accent flash, and promotes it into a full-frame headline.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "options",
        "tipo": "string",
        "padrao": "faster,smarter,together,everywhere",
        "descricao": "Comma-separated words shown by the ticker."
      },
      {
        "id": "final_word",
        "tipo": "string",
        "padrao": "together",
        "descricao": "Word the ticker locks on and promotes."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Color used for the lock flash and promoted word.",
        "opcoes": [
          "green",
          "blue",
          "violet"
        ]
      }
    ]
  },
  {
    "nome": "titlecard-calm",
    "grupo": "texto",
    "titulo": "Titlecard Calm",
    "oQue": "A restrained title card where a mono kicker and generous grotesque headline fade upward, drift almost imperceptibly, and exit cleanly.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "headline",
        "tipo": "string",
        "padrao": "Less, but better",
        "descricao": "Primary title displayed in the card."
      },
      {
        "id": "kicker",
        "tipo": "string",
        "padrao": "DESIGN PRINCIPLE",
        "descricao": "Small uppercase label displayed above the headline."
      }
    ]
  },
  {
    "nome": "spring-pop",
    "grupo": "destaque",
    "titulo": "Spring Pop",
    "oQue": "A badge pops in from a visible near-rest scale, overshoots full size once, and settles cleanly.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "overshoot",
        "tipo": "number",
        "padrao": 1.7,
        "descricao": "Strength passed to the back.out entrance curve.",
        "min": 1.1,
        "max": 2
      },
      {
        "id": "fromScale",
        "tipo": "number",
        "padrao": 0.9,
        "descricao": "Scale at the start of the entrance.",
        "min": 0.8,
        "max": 0.97
      },
      {
        "id": "text",
        "tipo": "string",
        "padrao": "New",
        "descricao": "Text displayed inside the badge."
      }
    ]
  },
  {
    "nome": "outline-draw",
    "grupo": "destaque",
    "titulo": "Outline Draw",
    "oQue": "A rounded outline that proves a callout by drawing clockwise as a hollow conic-gradient border with a clean closure.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "progress",
        "tipo": "number",
        "padrao": 100,
        "descricao": "Final percentage of the outline that is drawn.",
        "min": 0,
        "max": 100
      },
      {
        "id": "thickness",
        "tipo": "number",
        "padrao": 6,
        "descricao": "Outline stroke in tenths of the host width.",
        "min": 1,
        "max": 20
      },
      {
        "id": "radius",
        "tipo": "number",
        "padrao": 24,
        "descricao": "Corner radius in tenths of the host smaller dimension.",
        "min": 0,
        "max": 80
      }
    ]
  },
  {
    "nome": "testimonial-card",
    "grupo": "destaque",
    "titulo": "Testimonial Card",
    "oQue": "Reveals a customer quote at reading pace, then settles its avatar, author name, and handle beneath as a clean proof beat.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "quote",
        "tipo": "string",
        "padrao": "This changed how we ship.",
        "descricao": "Customer testimonial copy revealed at reading pace."
      },
      {
        "id": "author",
        "tipo": "string",
        "padrao": "Ken Tanaka",
        "descricao": "Name attributed to the testimonial."
      },
      {
        "id": "handle",
        "tipo": "string",
        "padrao": "@ken",
        "descricao": "Role or social handle shown beneath the author name."
      },
      {
        "id": "rating",
        "tipo": "number",
        "padrao": 5,
        "descricao": "Visible customer rating from zero to five stars.",
        "min": 0,
        "max": 5
      }
    ]
  },
  {
    "nome": "notification-stack",
    "grupo": "destaque",
    "titulo": "Notification Stack",
    "oQue": "1 to 5 token notification cards slide-settle into a vertical stack on cues, newest on top; one card grows slightly and brightens as the focus while the rest dim by position.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "titles",
        "tipo": "string",
        "padrao": "Build queued,Checks passed,Deploy live",
        "descricao": "Comma-separated card titles (1 to 5 cards)."
      },
      {
        "id": "bodies",
        "tipo": "string",
        "padrao": "Pipeline started for main,All 42 checks green,Now serving version 2.4",
        "descricao": "Comma-separated body lines matched to titles by index. Blank entries hide that body line."
      },
      {
        "id": "expand",
        "tipo": "number",
        "padrao": -1,
        "descricao": "Index of the focus card in the titles list. -1 focuses the newest card (top of the stack).",
        "min": -1,
        "max": 4
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated per-card arrival times in seconds. Blank entries use the default rhythm."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Accent token family used by the icon dots.",
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
        "descricao": "How the stack leaves the frame. Default none: the hold ends the film.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "native-notification-pop",
    "grupo": "destaque",
    "titulo": "Native Notification Pop",
    "oQue": "One system-faithful notification banner (iOS or macOS) drops in over any scene on an accurate interruptible spring: fast arrival, soft overshoot, settled mass, backdrop blur, app dot, title, one body line. Holds; tucks away only via exit.",
    "quando": "the payoff is \"it notifies you\" or a moment should feel native to the OS.",
    "evitar": "several notifications tell the story; that is notification-stack.",
    "envelope": "",
    "variaveis": [
      {
        "id": "title",
        "tipo": "string",
        "padrao": "Render complete",
        "descricao": "The notification title line."
      },
      {
        "id": "body",
        "tipo": "string",
        "padrao": "launch-cut.mp4 is ready to preview",
        "descricao": "One body line. Long lines truncate with an ellipsis."
      },
      {
        "id": "app_label",
        "tipo": "string",
        "padrao": "HyperFrames",
        "descricao": "Small-caps app name row beside the app dot."
      },
      {
        "id": "os",
        "tipo": "enum",
        "padrao": "ios",
        "descricao": "Banner geometry and placement: wide centered iOS or compact top-right macOS.",
        "opcoes": [
          "ios",
          "macos"
        ]
      },
      {
        "id": "at",
        "tipo": "number",
        "padrao": 0.3,
        "descricao": "Seconds after mount start when the banner drops in.",
        "min": 0,
        "max": 8
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "App dot color.",
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
        "descricao": "None holds the banner; up tucks it back off the top; fade fades it in place.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "comparison-split",
    "grupo": "destaque",
    "titulo": "Comparison Split",
    "oQue": "Two full-bleed panels compare before and after states as a persistent divider wipes the vivid after layer over the muted before layer and rests at a configurable split.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "split",
        "tipo": "number",
        "padrao": 50,
        "descricao": "Target resting position of the comparison divider.",
        "min": 0,
        "max": 100
      },
      {
        "id": "orientation",
        "tipo": "enum",
        "padrao": "horizontal",
        "descricao": "Axis and direction used by the comparison wipe.",
        "opcoes": [
          "horizontal",
          "vertical"
        ]
      },
      {
        "id": "labelA",
        "tipo": "string",
        "padrao": "Before",
        "descricao": "Caption shown on the base before panel."
      },
      {
        "id": "labelB",
        "tipo": "string",
        "padrao": "After",
        "descricao": "Caption shown on the revealed after panel."
      }
    ]
  },
  {
    "nome": "grid-card-assemble",
    "grupo": "destaque",
    "titulo": "Grid Card Assemble",
    "oQue": "N labeled token cards stagger-assemble into a grid or vertical list with a fade plus short slide directly into slot, no overshoot, then hold perfectly still.",
    "quando": "Several features, steps, or capabilities should land as one composed inventory the viewer can scan.",
    "evitar": "The features relate to one central thing and the relationship matters; constellation-hub draws that structure.",
    "envelope": "",
    "variaveis": [
      {
        "id": "items",
        "tipo": "string",
        "padrao": "Capture,Compose,Render,Publish",
        "descricao": "Comma-separated cards (3 to 12). \"Label: body\" adds a one-line muted body under the label."
      },
      {
        "id": "layout",
        "tipo": "enum",
        "padrao": "grid",
        "descricao": "Grid wraps by columns; list stacks vertically.",
        "opcoes": [
          "grid",
          "list"
        ]
      },
      {
        "id": "columns",
        "tipo": "number",
        "padrao": 0,
        "descricao": "Grid column count (grid layout only). 0 picks automatically: one row up to 3 items, then ceil(sqrt(N)).",
        "min": 0,
        "max": 4
      },
      {
        "id": "cues",
        "tipo": "string",
        "padrao": "",
        "descricao": "Comma-separated per-item entrance times in seconds. Blank entries use the default cascade."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Accent token family used by the card icons.",
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
        "descricao": "How the assembled layout leaves the frame. Default none: the hold ends the film.",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  },
  {
    "nome": "stagger-cascade",
    "grupo": "destaque",
    "titulo": "Stagger Cascade",
    "oQue": "A responsive grid of tile cards that fades and travels into place with an evenly spaced per-item GSAP stagger. The ordered cascade is the only visual mechanic.",
    "quando": "",
    "evitar": "",
    "envelope": "",
    "variaveis": [
      {
        "id": "itemCount",
        "tipo": "number",
        "padrao": 6,
        "descricao": "Number of tiles in the responsive grid.",
        "min": 3,
        "max": 12
      },
      {
        "id": "stagger",
        "tipo": "number",
        "padrao": 60,
        "descricao": "Delay between consecutive tile entrances.",
        "min": 20,
        "max": 150
      },
      {
        "id": "direction",
        "tipo": "enum",
        "padrao": "up",
        "descricao": "Direction each tile travels into its resting position.",
        "opcoes": [
          "up",
          "down",
          "left",
          "right"
        ]
      }
    ]
  },
  {
    "nome": "cta-close",
    "grupo": "destaque",
    "titulo": "CTA Close",
    "oQue": "The action-only close: one oversized action line rises into frame, one CTA capsule pops beneath it, and the lockup holds completely still.",
    "quando": "The film ends on an ask: sign up, start now, try it; the last thing on screen is the action.",
    "evitar": "The film should end on who made it rather than what to do; use logo-brand-close for the identity ending.",
    "envelope": "IN_BASE = 1.32s, per-word landing followed by the capsule pop HOLD = the rest of D, completely still OUT = none by default; 0.45s lockup departure when exit is fade or up If D is shorter than the fixed phases, they compress to fit. The timeline is never time-scaled.",
    "variaveis": [
      {
        "id": "action_line",
        "tipo": "string",
        "padrao": "Make it happen",
        "descricao": "Two to four word action that closes the film."
      },
      {
        "id": "button_label",
        "tipo": "string",
        "padrao": "Start now",
        "descricao": "Text displayed inside the single CTA capsule."
      },
      {
        "id": "accent",
        "tipo": "enum",
        "padrao": "green",
        "descricao": "Contract color used by the CTA capsule.",
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
        "descricao": "Optional departure. Default none: the lockup holds until the frame cuts (this primitive closes films).",
        "opcoes": [
          "none",
          "fade",
          "up"
        ]
      }
    ]
  }
];

export const NOMES_DOS_COMPONENTES = COMPONENTES_DO_CATALOGO.map((c) => c.nome);

export function componenteDoCatalogo(nome: string): ComponenteDoCatalogo | undefined {
  return COMPONENTES_DO_CATALOGO.find((c) => c.nome === nome);
}
