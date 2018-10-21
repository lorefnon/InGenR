export interface WarningEntry {
  index?: number
  message: string
  error?: Error
}

type WarningEntryFactory = (...args: any[]) => WarningEntry

export const warnInvalidArgBody = () => ({
  message:
    "Detected invalid line in the arguments body of an InGenR directive.\n" +
    "This line will be discarded."
})

