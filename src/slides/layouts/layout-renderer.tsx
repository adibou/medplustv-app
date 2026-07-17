import React from 'react';
import type { SlideContent } from '../../api/types';
import BigInfoLayout from './big-info-layout';
import ContactLayout from './contact-layout';
import FullImageLayout from './full-image-layout';
import ImageTextLayout from './image-text-layout';
import ScheduleLayout from './schedule-layout';
import ScheduleSimpleLayout from './schedule-simple-layout';
import TeamLayout from './team-layout';
import WelcomeLayout from './welcome-layout';

type Props = {
    layoutKey: string;
    content: SlideContent;
    accent: string;
};

export default function SlideLayoutRenderer({ layoutKey, content, accent }: Props) {
    if (layoutKey === 'schedule') return <ScheduleLayout content={content} />;
    if (layoutKey === 'schedule-simple') return <ScheduleSimpleLayout content={content} />;
    if (layoutKey === 'big-info') return <BigInfoLayout content={content} />;
    if (layoutKey === 'image-text') return <ImageTextLayout content={content} />;
    if (layoutKey === 'full-image') return <FullImageLayout content={content} />;
    if (layoutKey === 'team') return <TeamLayout content={content} />;
    if (layoutKey === 'contact') return <ContactLayout content={content} accent={accent} />;
    return <WelcomeLayout content={content} />;
}
