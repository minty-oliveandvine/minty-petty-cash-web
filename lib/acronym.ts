/**
 * The company's initials as Flask's header shows them (`blueprints/shared/entity_display.py::
 * build_entity_acronym`, default mode): the first character of each word, upper-cased -
 * "7 Eleven Store" -> "7ES".
 */
export function entityAcronym(name: string | null | undefined): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("");
}
