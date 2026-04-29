/**
 * WhatsApp CTA button — primary brand action per master plan iteration #2.
 * Phone number from NEXT_PUBLIC_AXHY_WHATSAPP env (E.164 without +).
 *
 * @derives(ADR-0005)
 */

const WA_NUMBER = process.env.NEXT_PUBLIC_AXHY_WHATSAPP ?? '919999999999';

type Props = {
  label: string;
  prefill?: string;
  size?: 'lg' | 'md';
  className?: string;
};

export function WhatsAppButton({ label, prefill, size = 'lg', className }: Props) {
  const url = prefill
    ? `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(prefill)}`
    : `https://wa.me/${WA_NUMBER}`;
  const sizeClass = size === 'lg' ? 'btn-lg' : '';
  return (
    <a
      className={['btn', 'btn-primary', sizeClass, className].filter(Boolean).join(' ')}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg className="wa-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.2-.5.1-.2 0-.4 0-.5 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.2 0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.7 4.3 3.8 1.5.6 2.1.7 2.8.6.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.1-1.3c1.4.8 3.1 1.3 4.9 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.3c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.2.8.9-3.1-.2-.3c-.9-1.4-1.4-3-1.4-4.6 0-4.6 3.7-8.3 8.3-8.3s8.3 3.7 8.3 8.3-3.7 8.3-8.3 8.3z" />
      </svg>
      {label}
    </a>
  );
}
