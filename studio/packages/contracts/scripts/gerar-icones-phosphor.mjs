// Gera src/icones-phosphor.ts a partir do @phosphor-icons/react (MIT):
// o peso "duotone" de cada ícone curado (o fundo em 20% e o contorno),
// para as cenas de motion. Rodar de novo ao mudar a curadoria:
//   node packages/contracts/scripts/gerar-icones-phosphor.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(aqui, '../../../apps/web/package.json'));
const defs = join(dirname(require.resolve('@phosphor-icons/react')), 'defs');

/** Curadoria por assunto (o que vídeo de alguém falando costuma pedir). */
const CATEGORIAS = {
  negocios: 'Briefcase ChartLineUp ChartBar ChartPie ChartPieSlice TrendUp TrendDown Handshake Target Lightbulb Rocket RocketLaunch Trophy Medal Crown Presentation PresentationChart Strategy Kanban ListChecks Calendar CalendarCheck CalendarBlank Clock Timer Hourglass HourglassMedium Alarm Buildings Building Storefront Factory Bank Scales Gavel Certificate IdentificationCard Users UsersThree User UserPlus UserCircle UserFocus Megaphone MegaphoneSimple Newspaper Notepad Clipboard ClipboardText FileText Files Folder FolderOpen Archive Signature Stamp Seal SealCheck Lightning Funnel FunnelSimple Path Flag FlagCheckered Compass Gauge Speedometer ArrowFatLinesUp',
  dinheiro: 'Money Coins CurrencyDollar CurrencyCircleDollar CurrencyBtc PiggyBank Wallet CreditCard Bank Receipt Tag Percent Calculator Barcode QrCode ShoppingCart ShoppingCartSimple ShoppingBag Basket Gift Package Truck HandCoins Coin CoinVertical Vault Invoice ChartLine',
  comunicacao: 'Envelope EnvelopeOpen EnvelopeSimple PaperPlaneTilt PaperPlaneRight Phone PhoneCall ChatCircle ChatCircleDots ChatCircleText ChatsCircle Chats ChatTeardropDots Bell BellRinging BellSimpleRinging Megaphone Broadcast Rss Hash At Share ShareNetwork Link Translate Microphone MicrophoneStage Headset VideoCamera Note NotePencil',
  tecnologia: 'Laptop Desktop DeviceMobile DeviceMobileCamera DeviceTablet Watch Headphones Camera FilmSlate FilmStrip Monitor MonitorPlay Television Keyboard Mouse Cpu HardDrives Database Cloud CloudArrowUp CloudCheck WifiHigh Bluetooth Robot Brain Code CodeSimple Terminal TerminalWindow Bug GitBranch Globe GlobeHemisphereWest Lock LockOpen LockKey Key ShieldCheck Shield ShieldWarning Fingerprint Eye EyeSlash MagnifyingGlass Gear GearSix Wrench Hammer Toolbox BatteryFull BatteryCharging BatteryLow Power Plug Sparkle MagicWand Cursor CursorClick HandPointing HandTap AppWindow Browser Browsers DownloadSimple UploadSimple Copy Trash PencilSimple PenNib PaintBrush Palette Image Images ImageSquare Play Pause PlayCircle SpeakerHigh SpeakerSlash MusicNotes Waveform Atom Flask TestTube Microscope Dna Planet Satellite QrCode Infinity Graph TreeStructure FlowArrow Cube Stack Layout',
  sentimentos: 'Heart HeartStraight ThumbsUp ThumbsDown Star Fire Confetti Smiley SmileyWink SmileySad SmileyMeh SmileyAngry SmileyNervous SmileyXEyes MaskHappy HandHeart HandsClapping HandWaving Hand HandFist HandPalm HeartBreak Sparkle Lightning Crown Diamond Butterfly Rainbow SunHorizon Ghost Skull Alien',
  saude: 'Heartbeat FirstAid FirstAidKit Pill Syringe Stethoscope Tooth Bed Moon MoonStars Sun Cloud CloudRain Snowflake Thermometer Drop Leaf Tree Plant Flower FlowerLotus Barbell Bicycle PersonSimpleRun PersonSimpleWalk PersonSimpleBike Person SoccerBall Basketball Volleyball TennisBall Bone Brain Eye Ear Baby',
  comida: 'Coffee Pizza Hamburger ForkKnife CookingPot Wine BeerStein Cake Carrot Egg Bread IceCream Popcorn Cookie Orange AppleLogo Avocado Fish Champagne Martini Pepper Grains',
  lugares: 'House HouseLine Couch Lamp Door MapPin MapTrifold NavigationArrow Car CarProfile Bus Airplane AirplaneTilt AirplaneTakeoff Train Boat Suitcase SuitcaseRolling Mountains Umbrella Tent Island Buildings Church Hospital Storefront Warehouse Garage Gas GasPump Signpost Path Globe Compass',
  educacao: 'Book BookOpen Books BookBookmark GraduationCap Exam Pencil PencilLine Ruler Student ChalkboardTeacher Chalkboard Lightbulb Question Brain Notebook Highlighter Certificate Medal',
  sinais: 'Info Warning WarningCircle WarningOctagon XCircle CheckCircle Check CheckFat X Plus Minus Equals Prohibit ProhibitInset Question SealQuestion SealWarning SealCheck ArrowRight ArrowUp ArrowDown ArrowLeft ArrowUpRight ArrowsClockwise ArrowCounterClockwise ArrowFatUp ArrowFatRight ArrowsOut ArrowsIn ArrowBendUpRight ArrowCircleRight ArrowsLeftRight CaretDoubleRight NumberCircleOne NumberCircleTwo NumberCircleThree Recycle Repeat Shuffle Funnel',
  lazer: 'GameController PuzzlePiece DiceFive Ticket FilmReel Popcorn MusicNote Guitar Headphones Microphone Camera PaintBrushBroad Palette PawPrint Dog Cat Bird Fish Horse Balloon Gift Confetti Party Sparkle Trophy Crown',
};

const lerDuotone = (nome) => {
  const f = join(defs, `${nome}.es.js`);
  if (!existsSync(f)) return null;
  const t = readFileSync(f, 'utf8');
  const i = t.indexOf('"duotone"');
  const j = t.indexOf('"fill"', i);
  const bloco = t.slice(i, j > i ? j : undefined);
  const fundo = [...bloco.matchAll(/d: "([^"]+)",\s*opacity: "0\.2"/g)].map((m) => m[1]);
  const todos = [...bloco.matchAll(/d: "([^"]+)"/g)].map((m) => m[1]);
  const linha = todos.filter((d) => !fundo.includes(d));
  if (!linha.length) return null;
  return [fundo.join(' '), linha.join(' ')];
};

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
const icones = {};
const categorias = {};
const faltaram = [];
for (const [cat, lista] of Object.entries(CATEGORIAS)) {
  categorias[cat] = [];
  for (const nome of [...new Set(lista.split(/\s+/).filter(Boolean))]) {
    const d = lerDuotone(nome);
    if (!d) {
      faltaram.push(nome);
      continue;
    }
    const chave = kebab(nome);
    icones[chave] = d;
    if (!categorias[cat].includes(chave)) categorias[cat].push(chave);
  }
}
const saida = `// ============================================================
// GERADO por scripts/gerar-icones-phosphor.mjs a partir do Phosphor Icons
// (MIT, (c) 2020 Phosphor Icons). Não editar à mão.
//
// O peso "duotone" de cada ícone curado: [fundo (pintado na cor de
// destaque), contorno (na cor do texto)], viewBox 0 0 256 256. Só o servidor
// importa este módulo (é grande): as cenas saem dele já com o SVG.
// ============================================================

export const ICONES_PHOSPHOR: Record<string, readonly [string, string]> = ${JSON.stringify(icones)};

export const CATEGORIAS_DOS_ICONES: Record<string, readonly string[]> = ${JSON.stringify(categorias)};
`;
writeFileSync(join(aqui, '../src/icones-phosphor.ts'), saida);
console.log(`${Object.keys(icones).length} ícones; faltaram: ${faltaram.join(', ') || 'nenhum'}`);
