// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { Modal } from '@/ui/modal';

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('tehlikeli işlemde onay düğmesi danger görünümünde ve onayı çağırır', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="İptal edilsin mi?" message="Bu iş iptal edilecek." confirmLabel="İptal et" tone="danger" onConfirm={onConfirm} onCancel={() => {}} />);
    const btn = screen.getByRole('button', { name: 'İptal et' });
    expect(btn.getAttribute('data-variant')).toBe('danger');
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('Modal', () => {
  it('erişilebilir diyalog özniteliklerine sahip', () => {
    render(<Modal open title="Sipariş" onClose={() => {}}><p>içerik</p></Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Sipariş').id).toBe(dialog.getAttribute('aria-labelledby'));
  });

  it('kirli formda Esc önce onay sorar, onaylanınca kapanır', () => {
    const onClose = vi.fn();
    render(<Modal open dirty title="Sipariş" onClose={onClose}><input aria-label="ad" /></Modal>);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/girdiğiniz bilgiler kaybolacak/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kapat ve vazgeç' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('temiz formda Esc doğrudan kapatır', () => {
    const onClose = vi.fn();
    render(<Modal open title="Sipariş" onClose={onClose}><p>x</p></Modal>);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
