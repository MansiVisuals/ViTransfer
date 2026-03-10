import { getRequestConfig } from 'next-intl/server'
import { getConfiguredLocale, loadLocaleMessages } from './locale'

export default getRequestConfig(async () => {
  const locale = await getConfiguredLocale()
  const messages = await loadLocaleMessages(locale)

  return {
    locale,
    messages,
  }
})
