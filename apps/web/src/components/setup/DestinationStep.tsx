import { Radio } from 'lucide-react';

import type { Destination, DestinationDraft } from '../../api/client.js';
import { DestinationForm } from '../DestinationForm.js';

export const DestinationStep = ({
  onCreate,
  destination,
  draft,
}: {
  onCreate: (draft: DestinationDraft) => Promise<void>;
  destination?: Destination;
  draft?: DestinationDraft;
}) => (
  <section className="setup-step" aria-labelledby="setup-destination-title">
    <div className="setup-step__icon" aria-hidden="true">
      <Radio />
    </div>
    <p className="eyebrow eyebrow--dark">Step 2 / First destination</p>
    <h1 id="setup-destination-title" data-setup-heading tabIndex={-1}>
      Where should the signal land?
    </h1>
    <p className="setup-step__lede">
      Start with one channel. You can add more after setup, each with its own topic
      filter.
    </p>
    {destination ? (
      <div className="setup-callout">
        <p>
          Re-enter the endpoint to edit <strong>{destination.name}</strong>. Stored
          webhook URLs stay masked, even here.
        </p>
      </div>
    ) : null}
    <DestinationForm
      key={`${destination?.id ?? 'new'}:${draft?.endpoint ?? 'masked'}`}
      onSubmit={onCreate}
      editing={Boolean(destination)}
      {...(draft
        ? { initialDraft: draft }
        : destination
          ? {
              initialDraft: {
                type: destination.type,
                name: destination.name,
                endpoint: '',
              },
            }
          : {})}
    />
  </section>
);
