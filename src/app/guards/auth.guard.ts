import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  // inject() muss vor dem ersten await passieren, danach ist der DI-Kontext weg.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready; // sonst wirft ein harter Reload eingeloggte User raus, siehe AuthService
  return auth.isLoggedIn() ? true : router.parseUrl('/');
};
