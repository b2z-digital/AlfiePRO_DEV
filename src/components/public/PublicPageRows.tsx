import React from 'react';
import type { EventPageRow } from '../../types/eventWidgets';
import { PageRows } from '../site/PageRows';

/** Renders page-builder rows on a club's public site (same code the site builder canvas uses). */
export const PublicPageRows: React.FC<{ rows: EventPageRow[]; websiteId: string }> = ({ rows, websiteId }) => (
  <PageRows rows={rows} websiteId={websiteId} />
);
