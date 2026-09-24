import { ElementName } from './ElementName';

/** A character's identity line — element, then the weapon they hold. One
 *  separator and one empty-weapon fallback, shared by the roster row and the
 *  character detail header. */
export function CharacterLine({
  element,
  weaponName,
}: {
  element?: string;
  weaponName?: string;
}) {
  return (
    <>
      {element && <ElementName element={element} />}
      {element && weaponName && ' · '}
      {weaponName}
      {!element && !weaponName && 'No weapon equipped'}
    </>
  );
}
