import { useEffect, useState } from 'react';
import {
  getFavorites,
  notifyFavoritesChanged,
  subscribeFavorites,
  toggleFavorite as toggleFavStore,
} from '../store/favorites';

export function useFavorites() {
  const [ids, setIds] = useState<number[]>(() => getFavorites());

  useEffect(() => subscribeFavorites(() => setIds(getFavorites())), []);

  const toggle = (id: number) => {
    const next = toggleFavStore(id);
    notifyFavoritesChanged();
    setIds(next);
  };

  const isFav = (id: number) => ids.includes(id);

  return { ids, toggle, isFav };
}
