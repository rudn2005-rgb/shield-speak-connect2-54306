/**
 * Sanitizes error messages to prevent information leakage
 * Always logs full error details for debugging while showing safe messages to users
 */
export function getUserFriendlyError(error: any): string {
  // Log full error for debugging (only visible in developer console)
  console.error('[Error Details]', error);
  
  // Map specific error codes to user-friendly messages
  if (error?.code === '23505') return 'Запись уже существует';
  if (error?.code === '23503') return 'Связанные данные не найдены';
  if (error?.code === 'PGRST301') return 'У вас нет доступа к этому ресурсу';
  if (error?.code === '42P01') return 'Ресурс не найден';
  
  // Map common message patterns
  if (error?.message?.includes('RLS') || error?.message?.includes('row-level security')) {
    return 'Отказано в доступе';
  }
  if (error?.message?.includes('JWT') || error?.message?.includes('authentication')) {
    return 'Требуется повторная авторизация';
  }
  if (error?.message?.includes('duplicate key')) {
    return 'Запись уже существует';
  }
  if (error?.message?.includes('foreign key')) {
    return 'Связанные данные не найдены';
  }
  
  // Generic fallback - never expose raw error messages
  return 'Произошла ошибка. Попробуйте позже.';
}
