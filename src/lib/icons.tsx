import type { Glyph } from './glyphs';
import {
  Wallet, Landmark, Smartphone, CreditCard, PiggyBank, HandCoins, Banknote, Coins, Vault, WalletCards,
  TrendingUp, TrendingDown, ChartLine, Bitcoin, CircleDollarSign, BadgePercent, Percent, Briefcase, Gift,
  Trophy, Sparkles, Handshake, HeartHandshake, Receipt, ReceiptText,
  Utensils, UtensilsCrossed, Coffee, Pizza, Beer, Cake, Salad, Soup, Sandwich, IceCreamCone, CupSoda, Croissant,
  ShoppingCart, ShoppingBag, Store, Package, Shirt, Gem, Glasses, Watch, Scissors,
  Car, Bus, Fuel, TrainFront, Bike, Plane, Motorbike, Ship, Truck, TramFront, Luggage,
  House, Building2, Sofa, Bed, Bath, Plug, Zap, Droplets, Wifi, Router, Smartphone as Phone2, Tv, Hammer, Wrench,
  Paintbrush, WashingMachine, Refrigerator,
  HeartPulse, Pill, Stethoscope, Hospital, Syringe, Dumbbell, Footprints,
  GraduationCap, BookOpen, School, Library, Pen, Laptop, Monitor, Code, Cpu, Headphones, Camera,
  Gamepad2, Film, Music, Popcorn, Ticket, TreePalm, Mountain, Tent, PartyPopper, Guitar, Dices,
  Baby, ToyBrick, Users, Dog, Cat, PawPrint, Heart, Church, HandHelping, Flower, Leaf, Sprout,
  Shield, Umbrella, Scale, Landmark as Gov, FileSpreadsheet, Calculator, Tag, Folder, Archive, Boxes, Factory,
  Rocket, Newspaper, Cloud, Server, Key, Lock, Star, Crown, Medal, Lightbulb, Flame, Hourglass, Repeat,
  Cigarette, Wine, Apple, Carrot, Drumstick, Mail, Phone, MapPin, Globe, Umbrella as Umb2,
} from './glyphs';

export const ICONS: Record<string, Glyph> = {
  wallet: Wallet, landmark: Landmark, smartphone: Smartphone, 'credit-card': CreditCard, 'piggy-bank': PiggyBank,
  'hand-coins': HandCoins, banknote: Banknote, coins: Coins, vault: Vault, 'wallet-cards': WalletCards,
  'trending-up': TrendingUp, 'trending-down': TrendingDown, 'chart-line': ChartLine, bitcoin: Bitcoin,
  'circle-dollar': CircleDollarSign, 'badge-percent': BadgePercent, percent: Percent, briefcase: Briefcase,
  gift: Gift, trophy: Trophy, sparkles: Sparkles, handshake: Handshake, 'heart-handshake': HeartHandshake,
  receipt: Receipt, 'receipt-text': ReceiptText,
  utensils: Utensils, 'utensils-crossed': UtensilsCrossed, coffee: Coffee, pizza: Pizza, beer: Beer, cake: Cake,
  salad: Salad, soup: Soup, sandwich: Sandwich, 'ice-cream': IceCreamCone, 'cup-soda': CupSoda, croissant: Croissant,
  'shopping-cart': ShoppingCart, 'shopping-bag': ShoppingBag, store: Store, package: Package, shirt: Shirt,
  gem: Gem, glasses: Glasses, watch: Watch, scissors: Scissors,
  car: Car, bus: Bus, fuel: Fuel, train: TrainFront, bike: Bike, plane: Plane, motorbike: Motorbike, ship: Ship,
  truck: Truck, tram: TramFront, luggage: Luggage,
  house: House, building: Building2, sofa: Sofa, bed: Bed, bath: Bath, plug: Plug, zap: Zap, droplets: Droplets,
  wifi: Wifi, router: Router, phone2: Phone2, tv: Tv, hammer: Hammer, wrench: Wrench, paintbrush: Paintbrush,
  'washing-machine': WashingMachine, refrigerator: Refrigerator,
  'heart-pulse': HeartPulse, pill: Pill, stethoscope: Stethoscope, hospital: Hospital, syringe: Syringe,
  dumbbell: Dumbbell, footprints: Footprints,
  'graduation-cap': GraduationCap, 'book-open': BookOpen, school: School, library: Library, pen: Pen,
  laptop: Laptop, monitor: Monitor, code: Code, cpu: Cpu, headphones: Headphones, camera: Camera,
  gamepad: Gamepad2, film: Film, music: Music, popcorn: Popcorn, ticket: Ticket, 'tree-palm': TreePalm,
  mountain: Mountain, tent: Tent, party: PartyPopper, guitar: Guitar, dices: Dices,
  baby: Baby, 'toy-brick': ToyBrick, users: Users, dog: Dog, cat: Cat, 'paw-print': PawPrint, heart: Heart,
  church: Church, 'hand-helping': HandHelping, flower: Flower, leaf: Leaf, sprout: Sprout,
  shield: Shield, umbrella: Umbrella, scale: Scale, gov: Gov, spreadsheet: FileSpreadsheet, calculator: Calculator,
  tag: Tag, folder: Folder, archive: Archive, boxes: Boxes, factory: Factory, rocket: Rocket, newspaper: Newspaper,
  cloud: Cloud, server: Server, key: Key, lock: Lock, star: Star, crown: Crown, medal: Medal, lightbulb: Lightbulb,
  flame: Flame, hourglass: Hourglass, repeat: Repeat, cigarette: Cigarette, wine: Wine, apple: Apple,
  carrot: Carrot, drumstick: Drumstick, mail: Mail, phone: Phone, 'map-pin': MapPin, globe: Globe, umbrella2: Umb2,
};

export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  {
    label: 'Keuangan',
    icons: ['wallet', 'landmark', 'smartphone', 'credit-card', 'piggy-bank', 'hand-coins', 'banknote', 'coins',
      'vault', 'wallet-cards', 'trending-up', 'trending-down', 'chart-line', 'bitcoin', 'circle-dollar',
      'badge-percent', 'percent', 'briefcase', 'gift', 'trophy', 'handshake', 'heart-handshake',
      'receipt', 'receipt-text', 'scale', 'calculator', 'spreadsheet'],
  },
  {
    label: 'Makanan',
    icons: ['utensils', 'utensils-crossed', 'coffee', 'pizza', 'beer', 'wine', 'cake', 'salad', 'soup', 'sandwich',
      'ice-cream', 'cup-soda', 'croissant', 'apple', 'carrot', 'drumstick'],
  },
  {
    label: 'Belanja',
    icons: ['shopping-cart', 'shopping-bag', 'store', 'package', 'shirt', 'gem', 'glasses', 'watch', 'scissors', 'tag'],
  },
  {
    label: 'Transportasi',
    icons: ['car', 'motorbike', 'bus', 'fuel', 'train', 'tram', 'bike', 'plane', 'ship', 'truck', 'luggage', 'map-pin'],
  },
  {
    label: 'Rumah & Tagihan',
    icons: ['house', 'building', 'sofa', 'bed', 'bath', 'plug', 'zap', 'droplets', 'wifi', 'router', 'phone', 'tv',
      'hammer', 'wrench', 'paintbrush', 'washing-machine', 'refrigerator', 'key'],
  },
  {
    label: 'Kesehatan',
    icons: ['heart-pulse', 'pill', 'stethoscope', 'hospital', 'syringe', 'dumbbell', 'footprints', 'heart'],
  },
  {
    label: 'Pendidikan & Kerja',
    icons: ['graduation-cap', 'book-open', 'school', 'library', 'pen', 'laptop', 'monitor', 'code', 'cpu',
      'headphones', 'camera', 'newspaper', 'lightbulb', 'rocket', 'factory', 'cloud', 'server'],
  },
  {
    label: 'Hiburan',
    icons: ['gamepad', 'film', 'music', 'popcorn', 'ticket', 'tree-palm', 'mountain', 'tent', 'party', 'guitar',
      'dices', 'star', 'crown', 'medal'],
  },
  {
    label: 'Keluarga & Sosial',
    icons: ['baby', 'toy-brick', 'users', 'dog', 'cat', 'paw-print', 'church', 'hand-helping', 'flower', 'leaf',
      'sprout', 'mail', 'globe'],
  },
  {
    label: 'Lainnya',
    icons: ['shield', 'umbrella', 'gov', 'folder', 'archive', 'boxes', 'lock', 'flame', 'hourglass', 'repeat',
      'cigarette'],
  },
];

export function getIcon(name?: string): Glyph {
  return (name && ICONS[name]) || Tag;
}

/* Palet kategori bernuansa tanah, mudah dibedakan di atas permukaan terang maupun gelap. */
export const PALETTE: { key: string; name: string; value: string }[] = [
  { key: 'green', name: 'Daun', value: '#4C8A58' },
  { key: 'mint', name: 'Sage', value: '#5F9A82' },
  { key: 'teal', name: 'Teal', value: '#2E7F80' },
  { key: 'cyan', name: 'Laut', value: '#3C8AAE' },
  { key: 'blue', name: 'Denim', value: '#3B6A96' },
  { key: 'indigo', name: 'Nila', value: '#57609F' },
  { key: 'purple', name: 'Plum', value: '#85578F' },
  { key: 'pink', name: 'Mawar', value: '#B95D78' },
  { key: 'red', name: 'Bata', value: '#A8432F' },
  { key: 'clay', name: 'Terakota', value: '#B8603C' },
  { key: 'orange', name: 'Jingga', value: '#C8792C' },
  { key: 'yellow', name: 'Mustard', value: '#B8912A' },
  { key: 'brown', name: 'Cokelat', value: '#8A6546' },
  { key: 'sand', name: 'Pasir', value: '#A88B5E' },
  { key: 'graphite', name: 'Batu', value: '#78736A' },
];

/** Pemetaan warna bawaan data tersimpan ke palet kategori. */
const LEGACY_COLORS: Record<string, string> = {
  '#D97757': '#B8603C',
  '#FF3B30': '#A8432F',
  '#FF9500': '#C8792C',
  '#F5B400': '#B8912A',
  '#34C759': '#4C8A58',
  '#00C7BE': '#5F9A82',
  '#30B0C7': '#2E7F80',
  '#32ADE6': '#3C8AAE',
  '#007AFF': '#3B6A96',
  '#5856D6': '#57609F',
  '#AF52DE': '#85578F',
  '#FF2D55': '#B95D78',
  '#A2845E': '#8A6546',
  '#C2A878': '#A88B5E',
  '#8E8E93': '#78736A',
};

export function remapColor(c: string | undefined): string | undefined {
  if (!c) return c;
  return LEGACY_COLORS[c.toUpperCase()] ?? c;
}

/** Nama ikon yang dipetakan ke ikon lain saat data dimuat. */
const LEGACY_ICONS: Record<string, string> = { sparkles: 'coins' };

export function remapIcon(i: string | undefined): string | undefined {
  if (!i) return i;
  return LEGACY_ICONS[i] ?? i;
}
