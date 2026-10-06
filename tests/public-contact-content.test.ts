import { describe, expect, it } from 'vitest';
import {
    CONTACT_FAQS,
    CONTACT_RESPONSE_MESSAGE,
    directionsUrl,
    NATIONAL_OFFICE_ADDRESS,
} from '@/lib/content/contact';

describe('public contact content', () => {
    it('does not promise an unconfigured response deadline', () => {
        expect(CONTACT_RESPONSE_MESSAGE).toBe('Responderemos o mais breve possível.');
        expect(CONTACT_RESPONSE_MESSAGE).not.toMatch(/\d|dias|horas/i);
    });
    it('encodes an external directions link without an API key or visitor data', () => {
        const url = new URL(directionsUrl(NATIONAL_OFFICE_ADDRESS));
        expect(url.origin).toBe('https://www.google.com');
        expect(url.pathname).toBe('/maps/dir/');
        expect([...url.searchParams.keys()]).toEqual(['api', 'destination']);
        expect(url.searchParams.get('destination')).toBe(NATIONAL_OFFICE_ADDRESS);
    });
    it('keeps addresses with special characters inside a single parameter', () => {
        const address = 'Rua A & B, nº 12 #sala 3';
        const url = new URL(directionsUrl(address));
        expect(url.hash).toBe('');
        expect(url.searchParams.get('destination')).toBe(address);
        expect(url.searchParams.size).toBe(2);
    });
    it('offers useful questions without guaranteeing capacity, ratings or deadlines', () => {
        expect(CONTACT_FAQS).toHaveLength(6);
        expect(new Set(CONTACT_FAQS.map((faq) => faq.question)).size).toBe(6);
        for (const faq of CONTACT_FAQS) {
            expect(faq.answer.length).toBeGreaterThan(60);
            expect(faq.answer).not.toMatch(/garantimos|em até \d|estrelas/i);
        }
    });
});
