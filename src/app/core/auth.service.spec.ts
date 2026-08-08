import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
    let service: AuthService;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({});
        service = TestBed.inject(AuthService);
    });

    it('começa deslogado', () => {
        expect(service.isLoggedIn()).toBe(false);
        expect(service.user()).toBeNull();
    });

    it('autentica com as credenciais corretas', () => {
        expect(service.login('admin', 'soufoda')).toBe(true);
        expect(service.isLoggedIn()).toBe(true);
        expect(service.user()?.username).toBe('admin');
    });

    it('aceita usuário com caixa diferente', () => {
        expect(service.login('  ADMIN ', 'soufoda')).toBe(true);
    });

    it('rejeita senha incorreta', () => {
        expect(service.login('admin', 'errada')).toBe(false);
        expect(service.isLoggedIn()).toBe(false);
    });

    it('rejeita usuário desconhecido', () => {
        expect(service.login('outro', 'soufoda')).toBe(false);
        expect(service.isLoggedIn()).toBe(false);
    });

    it('a senha diferencia maiúsculas de minúsculas', () => {
        expect(service.login('admin', 'SOUFODA')).toBe(false);
    });

    it('encerra a sessão no logout', () => {
        service.login('admin', 'soufoda');
        service.logout();
        expect(service.isLoggedIn()).toBe(false);
        expect(sessionStorage.getItem('spm_admin_session')).toBeNull();
    });

    it('restaura a sessão gravada no sessionStorage', () => {
        service.login('admin', 'soufoda');
        const restored = TestBed.runInInjectionContext(() => new AuthService());
        expect(restored.isLoggedIn()).toBe(true);
        expect(restored.user()?.username).toBe('admin');
    });
});
