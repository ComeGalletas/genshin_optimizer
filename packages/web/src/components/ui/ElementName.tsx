/** The element name, in that element's hue — see `elementTone.ts`. */
import { elementLabel } from '../../labels';
import { elementTone } from './elementTone';

export function ElementName({ element }: { element: string }) {
  return (
    <span className={elementTone(element)}>
      {/* Decorative: the element is written out right beside it. */}
      <span
        aria-hidden="true"
        className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle"
      />
      {elementLabel(element)}
    </span>
  );
}
