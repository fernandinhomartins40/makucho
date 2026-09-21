'use client';

// ============================================================
// Ícones da interface — Phosphor Icons.
//
// O guia de implementação dos assets é explícito: usar Lucide ou
// Phosphor, nunca extrair ícones do mockup. Escolhido o Phosphor.
//
// Este arquivo é uma camada de nomes, não um wrapper por gosto:
//
//   - mantém o PESO do traço coerente. Phosphor tem seis pesos e
//     eles vêm por prop (weight="fill"), não por sufixo no nome.
//     A interface usa "regular" por padrão; play, pausar e gravar
//     pedem weight="fill" no ponto de uso, onde a forma precisa de
//     presença;
//   - dá nome ao PAPEL e não ao desenho. Quem lê `IconeEditor`
//     entende a intenção; trocar Scissors por outro símbolo depois
//     muda um arquivo, não trinta;
//   - todos herdam currentColor, então seguem o estado (ativo,
//     hover, desabilitado) sem variante extra.
// ============================================================

import {
  FolderOpen,
  Article,
  Record,
  Scissors,
  Diamond,
  Question,
  Image as ImagemPh,
  TextT,
  ClosedCaptioning,
  MusicNotes,
  Sparkle,
  VideoCamera,
  ArrowCounterClockwise,
  ArrowClockwise,
  Play,
  Pause,
  Export,
  MagnifyingGlass,
  Plus,
  DotsThreeVertical,
  Eye,
  EyeSlash,
  Check,
  ArrowLeft,
  CloudCheck,
  CloudArrowUp,
  Clock,
  Trash,
  UploadSimple,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  CornersOut,
  Microphone,
  Gear,
  SignOut,
  Bell,
  Copy,
  SquareSplitHorizontal,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  ArrowsOutLineHorizontal,
  Warning,
  DotsSixVertical,
  CaretRight,
} from '@phosphor-icons/react';

export interface PropsDeIcone {
  size?: number;
  /** Cheio onde a forma precisa de presença; contorno no resto. */
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  color?: string;
}

// ---------- Navegação ----------
export const IconeProjetos = FolderOpen;
export const IconeRoteiro = Article;
export const IconeGravar = Record;
export const IconeEditor = Scissors;
export const IconeMarca = Diamond;
export const IconeAjuda = Question;

// ---------- Painéis do editor ----------
export const IconeMidia = ImagemPh;
export const IconeTexto = TextT;
export const IconeLegenda = ClosedCaptioning;
export const IconeAudio = MusicNotes;
/** Faísca marca onde a IA age, distinguindo do que é manual. */
export const IconeFerramentas = Sparkle;
export const IconeIA = Sparkle;
export const IconeVideo = VideoCamera;

// ---------- Ações ----------
export const IconeDesfazer = ArrowCounterClockwise;
export const IconeRefazer = ArrowClockwise;
export const IconeTocar = Play;
export const IconePausar = Pause;
export const IconeExportar = Export;
export const IconeBusca = MagnifyingGlass;
export const IconeMais = Plus;
export const IconeMenu = DotsThreeVertical;
export const IconeOlho = Eye;
export const IconeOlhoFechado = EyeSlash;
export const IconeCheck = Check;
export const IconeVoltar = ArrowLeft;
export const IconeLixeira = Trash;
export const IconeEnviar = UploadSimple;
export const IconeCopiar = Copy;
export const IconeDividir = SquareSplitHorizontal;
export const IconeCortar = Scissors;

// ---------- Estado ----------
export const IconeSalvo = CloudCheck;
export const IconeSalvando = CloudArrowUp;
export const IconeRelogio = Clock;
export const IconeAviso = Warning;
export const IconeNuvem = CloudCheck;

// ---------- Player ----------
export const IconeAnterior = SkipBack;
export const IconeProximo = SkipForward;
export const IconeVolume = SpeakerHigh;
export const IconeTelaCheia = CornersOut;

// ---------- Gravação ----------
export const IconeCamera = VideoCamera;
export const IconeMicrofone = Microphone;
export const IconeConfiguracoes = Gear;
export const IconeSair = SignOut;
export const IconeNotificacao = Bell;

// ---------- Timeline ----------
export const IconeZoomMenos = MagnifyingGlassMinus;
export const IconeZoomMais = MagnifyingGlassPlus;
export const IconeAjustar = ArrowsOutLineHorizontal;
/** Alça de arrastar: seis pontos é a convenção do Phosphor. */
export const IconeArrastar = DotsSixVertical;
export const IconeAvancar = CaretRight;
