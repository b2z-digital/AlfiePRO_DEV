const BOAT_CLASS_IMAGES: { keywords: string[]; image: string }[] = [
  {
    keywords: ['ten rater', '10 rater', '10r', '10-r'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761693386070-10r31_orig.jpg'
  },
  {
    keywords: ['international one metre', 'iom', 'one metre'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761693863856-IOM-Europeans-Spain-2023-Torrevieja-starting-upwind-1.jpg'
  },
  {
    keywords: ['dragonflite 95', 'dragon force 95', 'df95', 'df-95'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761694881094-P1060377.jpg'
  },
  {
    keywords: ['dragon force 65', 'dragonflite 65', 'df65', 'df-65'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761694758064-DF65.jpeg'
  },
  {
    keywords: ['marblehead', 'm class'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761693804892-M%20Page%20Image.jpg'
  },
  {
    keywords: ['a class', 'a-class'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761693570342-A%20Class%20Start%202.jpg'
  },
  {
    keywords: ['rc laser', 'rclaser'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761694396750-Dobroyd-RC-lasers-close-racing.jpg'
  },
  {
    keywords: ['ec12', 'east coast 12', 'east coast twelve'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761695045578-EC12-Nats.jpg'
  },
  {
    keywords: ['soling', 's1m', 'soling one meter'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761694977244-Soling-Nationals-start.jpg'
  },
  {
    keywords: ['wind warrior'],
    image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761695142975-Large_IMG_673320110902%20at%20162351.jpg'
  },
];

export function getBoatClassImage(boatClass: string | null | undefined): string | null {
  if (!boatClass) return null;
  const lower = boatClass.toLowerCase();
  for (const entry of BOAT_CLASS_IMAGES) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.image;
    }
  }
  return null;
}
