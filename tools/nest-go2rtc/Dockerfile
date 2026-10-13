FROM --platform=$BUILDPLATFORM golang:1.25.5-alpine AS build
ARG TARGETOS
ARG TARGETARCH
RUN apk add --no-cache curl patch
WORKDIR /src
# Pin the release archive as well as the local, inspected upstream patch.
RUN curl -fsSL https://codeload.github.com/AlexxIT/go2rtc/tar.gz/refs/tags/v1.9.14 -o /tmp/source.tar.gz \
    && echo 'e3d59e553dfd0085889a2956281cfc0fd78bb7b4d6269d1c90c217d2ffcf2c7b  /tmp/source.tar.gz' | sha256sum -c - \
    && tar -xzf /tmp/source.tar.gz --strip-components=1
COPY nest-receiver.patch /tmp/nest-receiver.patch
RUN patch -p1 < /tmp/nest-receiver.patch \
    && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags='-s -w' -o /out/go2rtc .

FROM alpine:3.23
RUN apk add --no-cache ca-certificates
COPY --from=build /out/go2rtc /usr/local/bin/go2rtc
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/go2rtc"]
