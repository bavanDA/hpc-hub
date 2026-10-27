/* The backend's python program. Python for Android comes as a library only, so this is the program the app runs
 * (as libhpchub_backend.so, from the APK's native libraries). See docs/design/android.md. */
#include <Python.h>

int main(int argc, char **argv) {
    return Py_BytesMain(argc, argv);
}
