import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, Info, AlertTriangle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const toastIconMap = {
  default: null,
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  destructive: XCircle,
} as const

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={5000}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const variant = props.variant || 'default'
        const IconComponent = toastIconMap[variant as keyof typeof toastIconMap]
        const iconColorClass = variant === 'success' ? 'text-green-500' 
          : variant === 'info' ? 'text-blue-500'
          : variant === 'warning' ? 'text-yellow-500'
          : variant === 'destructive' ? 'text-destructive'
          : 'text-muted-foreground'

        return (
          <Toast key={id} {...props}>
            <div className="flex items-start gap-3 flex-1">
              {IconComponent && (
                <IconComponent className={cn("h-5 w-5 flex-shrink-0 mt-0.5", iconColorClass)} />
              )}
              <div className="grid gap-1 flex-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
