import '@fontsource-variable/inter'
import '@fontsource-variable/literata'
import 'primeicons/primeicons.css'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { createApp } from 'vue'
import { messageOf } from './api/client'
import App from './App.vue'
import './assets/main.css'
import { GlossTheme } from './assets/theme'

const app = createApp(App)
  .use(PrimeVue, {
    theme: {
      preset: GlossTheme,
      options: {
        // Light only: no dark theme is generated.
        darkModeSelector: 'none',
        // Same order as main.css, whichever stylesheet the browser sees first.
        cssLayer: { name: 'primevue', order: 'theme, base, primevue, components, utilities' },
      },
    },
  })
  .use(ToastService)
  .use(ConfirmationService)
  .directive('tooltip', Tooltip)

// Safety net for anything a component didn't handle itself (expected failures are shown where they
// happen, next to the form or on the page): log it for us, and tell the user something went wrong.
app.config.errorHandler = (error) => {
  console.error(error)
  app.config.globalProperties.$toast.add({
    severity: 'error',
    summary: 'Unexpected error',
    detail: messageOf(error),
    life: 6000,
  })
}

app.mount('#app')
