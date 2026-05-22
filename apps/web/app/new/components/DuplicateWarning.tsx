'use client';

import Link from 'next/link';
import { Tag } from '@call-it/ui';

interface DuplicateWarningProps {
  existingCallId: number;
}

/**
 * DuplicateWarning — amber inline warning shown when the dup-check returns a match.
 *
 * CALL-49: User sees this warning above the conviction slider when a near-identical
 * call already exists. The warning includes a link to quote the existing call instead.
 *
 * D-22: Triggered by the 400ms debounced dup-check hook (useDebouncedDupCheck).
 *
 * Copy is verbatim per CALL-49 acceptance criteria:
 *   "A nearly identical call is already live — quote it instead"
 */
export function DuplicateWarning({ existingCallId }: DuplicateWarningProps) {
  return (
    <div className="flex items-center gap-3 p-3 border-2 border-yellow-500 bg-yellow-50 rounded-none">
      {/* Warning icon */}
      <Tag intent="warning" className="shrink-0 text-xs font-mono">
        DUPLICATE
      </Tag>

      <div className="flex-1 font-mono text-sm text-yellow-800">
        A nearly identical call is already live — quote it instead
      </div>

      <Link
        href={`/new?quote=${existingCallId}`}
        className="shrink-0 text-xs font-mono underline text-yellow-700 hover:text-yellow-900"
        aria-label={`Quote call ${existingCallId}`}
      >
        quote it instead →
      </Link>
    </div>
  );
}
