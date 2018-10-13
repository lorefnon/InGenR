export interface WarningEntry {
  index?: number
  message: string
  error?: Error
}

type WarningEntryFactory = (...args: any[]) => WarningEntry

export const warnInterpolated = (index: number | undefined) =>
  ({
    index,
    message:
      "Detected extraneous content surrounding an InGenR directive.\n" +
      "InGenR directives are expected to be specified in a dedicated line.\n" +
      "This directive will be discarded."
  } as WarningEntry)

export const warnInvalidArgBody = () => ({
  message:
    "Detected invalid line in the arguments body of an InGenR directive.\n" +
    "This line will be discarded."
})
