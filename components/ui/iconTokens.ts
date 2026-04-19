/**
 * Tamaños unificados de iconos TripBoard.
 * - Ranura 40×40: SVG e imagen ocupan 32×32 (size-8) centrados.
 * - Botón redondo 40×40 solo icono: mismo trazo visual.
 * - Inline junto a texto en botones compactos: 16px (size-4).
 */

/** Rellena un contenedor h-10 w-10 (direct children: svg o img) */
export const iconSlotFill40 =
  "[&>svg]:size-8 [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:shrink-0 [&>img]:size-8 [&>img]:max-h-full [&>img]:max-w-full [&>img]:shrink-0 [&>img]:object-contain";

/** Contenedor 40×40 estándar + relleno de icono */
export const iconSlot40 =
  `inline-flex h-10 w-10 shrink-0 items-center justify-center ${iconSlotFill40}`;

/** Icono junto a etiqueta en pill / botón compacto (no ranura dedicada) */
export const iconInline16 = "size-4 shrink-0";

/** Barra inferior móvil: área del pictograma (~36px) */
export const iconSlotNavBottom =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg [&>img]:size-8 [&>img]:max-h-full [&>img]:max-w-full [&>img]:object-contain [&>svg]:size-8 [&>svg]:shrink-0";

/** Botón cuadrado ~44px solo icono (pasos del tour) */
export const iconSlotFill44 =
  "[&>svg]:size-7 [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:shrink-0";

/** FAB asistente 56×56 */
export const iconSlotFab56 =
  "[&>svg]:size-9 [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:shrink-0";
