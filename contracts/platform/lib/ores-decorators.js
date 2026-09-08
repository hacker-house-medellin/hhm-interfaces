// TypeSpec runtime hooks for persistence metadata. ores-contracts reads the
// decorator declarations structurally; these no-op hooks let the independent
// TypeSpec compiler validate the authority without applying side effects.
export function $table() {}
export function $unique() {}
export function $index() {}
export function $references() {}

export const $decorators = {
  Ores: {
    table: $table,
    unique: $unique,
    index: $index,
    references: $references,
  },
};
