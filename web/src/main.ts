import '@fontsource-variable/inter'
import '@fontsource-variable/literata'
import 'primeicons/primeicons.css'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'
import { GlossTheme } from './assets/theme'

createApp(App)
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
  .mount('#app')
