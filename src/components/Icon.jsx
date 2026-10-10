import { Leaf, Sprout, Trees, Flower2, Recycle, Bike, BookOpen, Sun, HandHelping } from 'lucide-react';

const icons = { all: Leaf, cleanup: HandHelping, planting: Trees, conservation: Flower2, gardening: Sprout, recycling: Recycle, transport: Bike, education: BookOpen, energy: Sun };
export function CategoryIcon({ category, ...props }) {
  const Icon = icons[category] || Leaf;
  return <Icon aria-hidden="true" size={17} strokeWidth={1.7} {...props} />;
}
