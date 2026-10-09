# Barcode Scanner

Public photo and short-video upload interface. Files are read by the operator’s connected reader computer; no model, decoding implementation, or research samples are distributed in this repository.

Public and hidden results are shown separately. Hidden values are unconfirmed candidates. Original uploads and reports are retained privately by the service.

Read the captured photo or video first. After its result is complete, either upload the corresponding original electronic barcode for a separate read, or enter the original encoded message and optionally its EAN-13. Center-frame and fixed-five-frame results are compared separately. Electronic-image agreement and agreement with a user-provided encoded message are labeled distinctly.

Known message input stays in the visitor’s browser and is never sent to the image reader. A comparison download includes the original captured report, its reference, and the comparison; it does not replace either decoded result or grant authentication or quality approval. Text references use the current encoder’s UTF-8 representation padded with spaces to seven bytes, displayed explicitly as hex.

Print videos additionally show a fixed-five-frame development cascade: preserve the hard-five-frame candidate, then use agreement between at least two decoded frames without competing messages, then the existing fixed p=4 soft decision. The same five original frames are used throughout, with no replacement or reference-assisted selection. Photos and screen mode keep their existing behavior. The hard result and the new candidate are retained and compared separately.

The operator's private reader performs this calculation; no decoder implementation or printing sample is published here. All candidates remain unconfirmed because blank rejection is uncalibrated. An explicitly known blank control can be compared after reading: any decoded candidate is marked as a blank false candidate, and unmeasurable data never passes. A single blank without a candidate does not establish calibrated rejection.
