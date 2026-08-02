import { useCallback, useEffect, useState } from 'react';
import {
  getFavorites,
  notifyFavoritesChanged,
  subscribeFavorites,
  toggleFavorite as toggleFavStore,
} from '../store/favorites';

export function useFavorites() {
  const [ids, setIds] = useState<number[]>(() => getFavorites());

  useEffect(() => subscribeFavorites(() => setIds(getFavorites())), []);

  const toggle = useCallback((id: number) => {
    const next = toggleFavStore(id);
    notifyFavoritesChanged();
    setIds(next);
  }, []);

  const isFav = useCallback((id: number) => ids.includes(id), [ids]);

  return { ids, toggle, isFav };
}
